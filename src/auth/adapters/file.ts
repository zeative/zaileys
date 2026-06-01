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

export class FileAuthStore implements AuthStoreBundle {
  private readonly basePath: string
  private closed = false

  constructor(options?: FileAuthStoreOptions) {
    this.basePath = options?.basePath ?? DEFAULT_BASE_PATH
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
        await fs.mkdir(dir, { recursive: true })
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
      await fs.rm(this.basePath, { recursive: true, force: true })
    },
    close: async (): Promise<void> => {
      this.closed = true
    },
  }

  readonly creds: AuthCredsStore = {
    readCreds: async (): Promise<AuthenticationCreds | undefined> => {
      this.assertOpen()
      try {
        const raw = await fs.readFile(this.credsPath(), 'utf8')
        return JSON.parse(raw, BufferJSON.reviver) as AuthenticationCreds
      } catch (err) {
        if (isENOENT(err)) return undefined
        throw new ZaileysStoreError('STORE_READ_FAILED', 'failed to read creds.json', { cause: err })
      }
    },
    writeCreds: async (next: AuthenticationCreds): Promise<void> => {
      this.assertOpen()
      await fs.mkdir(this.basePath, { recursive: true })
      await this.atomicWrite(this.credsPath(), JSON.stringify(next, BufferJSON.replacer))
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

  private signalDir(type: AuthStoreKey): string {
    return path.join(this.basePath, 'signal', String(type))
  }

  private signalPath(type: AuthStoreKey, id: string): string {
    return path.join(this.signalDir(type), `${encodeFilename(id)}.json`)
  }

  private async atomicWrite(target: string, content: string): Promise<void> {
    const tmp = path.join(path.dirname(target), `tmp-${randomBytes(8).toString('hex')}`)
    try {
      await fs.writeFile(tmp, content, 'utf8')
      await fs.rename(tmp, target)
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
