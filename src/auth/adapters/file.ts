import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { BufferJSON } from 'baileys'
import type { AuthenticationCreds, SignalDataSet } from 'baileys'
import { ZaileysStoreError } from '../../types/store-error.js'
import type {
  AuthCredsStore,
  AuthStore,
  AuthStoreBundle,
  AuthStoreKey,
  AuthStoreValue,
} from '../types.js'

export interface FileAuthStoreOptions {
  basePath?: string
}

const DEFAULT_BASE_PATH = './.zaileys/auth'

const encodeFilename = (id: string): string =>
  id.replace(/[^a-zA-Z0-9._-]/g, (c) => `_${c.charCodeAt(0).toString(16)}`)

const isENOENT = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT'

/** Credentials are full account access: owner-only, and never world-readable even briefly. */
const FILE_MODE = 0o600
const DIR_MODE = 0o700

/** Best effort — some platforms reject opening a directory, and the rename already happened. */
const syncDirectory = async (dir: string): Promise<void> => {
  try {
    const handle = await fs.open(dir, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch {
    return
  }
}

export class FileAuthStore implements AuthStoreBundle {
  private readonly basePath: string
  /** Where credentials live, so callers can keep that directory out of reach of media loading. */
  get directory(): string {
    return this.resolvedBase
  }
  private readonly resolvedBase: string
  private closed = false

  constructor(options?: FileAuthStoreOptions) {
    this.basePath = options?.basePath ?? DEFAULT_BASE_PATH
    this.resolvedBase = path.resolve(this.basePath)
  }

  /** Independent of the caller's validation: nothing this store touches may escape its base. */
  private assertContained(target: string): string {
    const resolved = path.resolve(target)
    if (resolved !== this.resolvedBase && !resolved.startsWith(this.resolvedBase + path.sep)) {
      throw new ZaileysStoreError(
        'STORE_WRITE_FAILED',
        `refusing to touch ${target}: outside ${this.basePath}`,
      )
    }
    return resolved
  }

  readonly signal: AuthStore = {
    read: async <K extends AuthStoreKey>(
      type: K,
      ids: readonly string[],
    ): Promise<{ [id: string]: AuthStoreValue<K> | undefined }> => {
      this.assertOpen()
      const out: { [id: string]: AuthStoreValue<K> | undefined } = {}
      await Promise.all(
        ids.map(async (id) => {
          const file = this.signalPath(type, id)
          try {
            const raw = await fs.readFile(file, 'utf8')
            out[id] = JSON.parse(raw, BufferJSON.reviver) as AuthStoreValue<K>
          } catch (err) {
            if (isENOENT(err)) return
            throw new ZaileysStoreError('STORE_READ_FAILED', `failed to read ${file}`, { cause: err })
          }
        }),
      )
      return out
    },
    write: async (data: SignalDataSet): Promise<void> => {
      this.assertOpen()
      const tasks: Promise<void>[] = []
      for (const rawType of Object.keys(data) as AuthStoreKey[]) {
        const entries = (data as Record<string, Record<string, unknown> | undefined>)[rawType]
        if (!entries) continue
        const dir = this.signalDir(rawType)
        await fs.mkdir(dir, { recursive: true, mode: DIR_MODE })
        for (const id of Object.keys(entries)) {
          const value = entries[id]
          const target = this.signalPath(rawType, id)
          if (value === null) {
            tasks.push(
              fs.unlink(target).catch((err) => {
                if (!isENOENT(err)) {
                  throw new ZaileysStoreError('STORE_WRITE_FAILED', `failed to unlink ${target}`, {
                    cause: err,
                  })
                }
              }),
            )
          } else if (value !== undefined) {
            tasks.push(this.atomicWrite(target, JSON.stringify(value, BufferJSON.replacer)))
          }
        }
      }
      await Promise.all(tasks)
    },
    delete: async <K extends AuthStoreKey>(type: K, ids: readonly string[]): Promise<void> => {
      this.assertOpen()
      await Promise.all(
        ids.map(async (id) => {
          const file = this.signalPath(type, id)
          try {
            await fs.unlink(file)
          } catch (err) {
            if (!isENOENT(err)) {
              throw new ZaileysStoreError('STORE_WRITE_FAILED', `failed to unlink ${file}`, {
                cause: err,
              })
            }
          }
        }),
      )
    },
    clear: async (): Promise<void> => {
      this.assertOpen()
      /** Everything except the quarantined snapshots, so a wipe stays recoverable by hand. */
      let names: string[]
      try {
        names = await fs.readdir(this.basePath)
      } catch (err) {
        if (isENOENT(err)) return
        throw new ZaileysStoreError('STORE_WRITE_FAILED', `failed to read ${this.basePath}`, {
          cause: err,
        })
      }
      await Promise.all(
        names
          .filter((name) => !(name.startsWith('creds.revoked-') && name.endsWith('.json')))
          .map((name) => fs.rm(path.join(this.basePath, name), { recursive: true, force: true })),
      )
    },
    close: async (): Promise<void> => {
      this.closed = true
    },
  }

  readonly creds: AuthCredsStore = {
    readCreds: async (): Promise<AuthenticationCreds | undefined> => {
      this.assertOpen()
      let raw: string
      try {
        raw = await fs.readFile(this.credsPath(), 'utf8')
      } catch (err) {
        if (isENOENT(err)) return undefined
        throw new ZaileysStoreError('STORE_READ_FAILED', 'failed to read creds.json', { cause: err })
      }
      try {
        return JSON.parse(raw, BufferJSON.reviver) as AuthenticationCreds
      } catch (err) {
        /** A torn write leaves unparseable JSON; the newest snapshot beats reporting no session. */
        const recovered = await this.newestBackup()
        if (recovered !== undefined) return recovered
        throw new ZaileysStoreError('STORE_READ_FAILED', 'creds.json is corrupt', { cause: err })
      }
    },
    writeCreds: async (next: AuthenticationCreds): Promise<void> => {
      this.assertOpen()
      await fs.mkdir(this.basePath, { recursive: true, mode: DIR_MODE })
      await this.atomicWrite(this.credsPath(), JSON.stringify(next, BufferJSON.replacer))
    },
    backupCreds: async (): Promise<void> => {
      this.assertOpen()
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      try {
        await fs.copyFile(this.credsPath(), path.join(this.basePath, `creds.revoked-${stamp}.json`))
      } catch (err) {
        if (!isENOENT(err)) {
          throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to back up creds.json', {
            cause: err,
          })
        }
      }
    },
    readBackupCreds: async (): Promise<AuthenticationCreds | undefined> => {
      this.assertOpen()
      return this.newestBackup()
    },
    deleteCreds: async (): Promise<void> => {
      this.assertOpen()
      try {
        await fs.unlink(this.credsPath())
      } catch (err) {
        if (!isENOENT(err)) {
          throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to delete creds.json', {
            cause: err,
          })
        }
      }
    },
  }

  private credsPath(): string {
    return path.join(this.basePath, 'creds.json')
  }

  /** Newest `creds.revoked-*.json`, or undefined when nothing was ever quarantined. */
  private async newestBackup(): Promise<AuthenticationCreds | undefined> {
    let names: string[]
    try {
      names = await fs.readdir(this.basePath)
    } catch {
      return undefined
    }
    const backups = names.filter((n) => n.startsWith('creds.revoked-') && n.endsWith('.json')).sort()
    for (const name of backups.reverse()) {
      try {
        const raw = await fs.readFile(path.join(this.basePath, name), 'utf8')
        return JSON.parse(raw, BufferJSON.reviver) as AuthenticationCreds
      } catch {
        continue
      }
    }
    return undefined
  }

  private signalDir(type: AuthStoreKey): string {
    return path.join(this.basePath, 'signal', String(type))
  }

  private signalPath(type: AuthStoreKey, id: string): string {
    return this.assertContained(path.join(this.signalDir(type), `${encodeFilename(id)}.json`))
  }

  /**
   * Durable replace: the bytes are flushed before the rename, so a crash mid-write leaves either the
   * old file or the new one — never a truncated `creds.json`, which reads as a lost session.
   */
  private async atomicWrite(target: string, content: string): Promise<void> {
    const dir = path.dirname(target)
    const tmp = path.join(dir, `tmp-${randomBytes(8).toString('hex')}`)
    try {
      const handle = await fs.open(tmp, 'w', FILE_MODE)
      try {
        await handle.writeFile(content, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await fs.rename(tmp, target)
      await syncDirectory(dir)
    } catch (err) {
      await fs.unlink(tmp).catch(() => undefined)
      throw new ZaileysStoreError('STORE_WRITE_FAILED', `failed to write ${target}`, { cause: err })
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ZaileysStoreError('STORE_CLOSED', 'FileAuthStore is closed')
    }
  }
}
