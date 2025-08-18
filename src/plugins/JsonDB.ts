import { BufferJSON } from 'baileys'
import { existsSync, mkdirSync, readdirSync, unlinkSync, readFileSync, renameSync, writeFileSync } from 'fs'
const lowdb = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
import { dirname } from 'path'
import { toJson, toString } from '../utils/helpers'

const CHUNK_SIZE = 1000

export class JsonDB {
  private session = 'zaileys-sessions'
  private db: any
  private storeDir: string

  async initialize(session: string) {
    this.session = session
    const authPath = `sessions/${this.session}/auth.json`
    this.storeDir = `sessions/${this.session}/stores`
    const dirAuth = dirname(authPath)
    if (!existsSync(dirAuth)) mkdirSync(dirAuth, { recursive: true })
    if (!existsSync(this.storeDir)) mkdirSync(this.storeDir, { recursive: true })
    const adapter = new FileSync(authPath)
    this.db = lowdb(adapter)
    this.db.defaults([]).write()
  }

  private tryRecoverRaw(raw: string): any | null {
    const s = raw.trim()
    try {
      return JSON.parse(s)
    } catch {
      try {
        const a = s.indexOf('[')
        const b = s.lastIndexOf(']')
        if (a !== -1 && b !== -1 && b > a) {
          const sub = s.slice(a, b + 1)
          return JSON.parse(sub)
        }
      } catch { }
      try {
        const wrapped = `[${s.replace(/}\s*{/g, '},{')}]`
        return JSON.parse(wrapped)
      } catch { }
      try {
        const lines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        const parsed = lines.map(l => {
          try { return JSON.parse(l) } catch { return null }
        }).filter(Boolean)
        if (parsed.length) return parsed
      } catch { }
    }
    return null
  }

  private async chunks(key: string): Promise<any[]> {
    const files = readdirSync(this.storeDir)
      .filter(f => f.startsWith(`${key}-`) && f.endsWith('.json'))
      .sort()
    const result: any[] = []
    for (const file of files) {
      const full = `${this.storeDir}/${file}`
      const adapter = new FileSync(full)
      const db = lowdb(adapter)
      try {
        db.defaults([]).write()
        result.push(...toJson(db.value()))
      } catch {
        let raw = ''
        try { raw = readFileSync(full, 'utf8') } catch { raw = '' }
        const recovered = raw ? this.tryRecoverRaw(raw) : null
        if (recovered) {
          db.setState(Array.isArray(recovered) ? recovered : recovered).write()
          result.push(...toJson(db.value()))
        } else {
          const corrupt = `${full}.corrupt.${Date.now()}`
          try { renameSync(full, corrupt) } catch {
            try { writeFileSync(full, '[]', 'utf8') } catch { }
          }
        }
      }
    }
    return result
  }

  private async writeChunks(key: string, items: any[]) {
    readdirSync(this.storeDir)
      .filter(f => f.startsWith(`${key}-`) && f.endsWith('.json'))
      .forEach(f => unlinkSync(`${this.storeDir}/${f}`))
    let index = 0
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE)
      const file = `${this.storeDir}/${key}-${index}.json`
      const adapter = new FileSync(file)
      const db = lowdb(adapter)
      db.setState(chunk).write()
      try {
        db.write()
      } catch (err: any) {
        if (err?.code === 'ENOENT') {
          try {
            renameSync(`${file}.tmp`, file)
          } catch {
            try { db.write() } catch {
              try { writeFileSync(file, JSON.stringify(chunk), 'utf8') } catch { }
            }
          }
        } else {
          throw err
        }
      }
      index++
    }
  }

  store(key: string) {
    return {
      read: async (id: string) => {
        const list = await this.chunks(key)
        const row = list.find(i => i.id === id)
        return row ? JSON.parse(row.value) : null
      },
      write: async (obj: any) => {
        const list = await this.chunks(key)
        const id = obj?.key?.id || obj.id
        const serialized = JSON.stringify(obj)
        const idx = list.findIndex(i => i.id === id)
        if (idx !== -1) list[idx].value = serialized
        else list.push({ id, value: serialized })
        await this.writeChunks(key, list)
      }
    }
  }

  async upsert(id: string, value: any) {
    const replacer = JSON.stringify(value, BufferJSON.replacer)
    const dbValue = this.db.value()
    const data = Array.isArray(dbValue) ? dbValue : []
    const idx = data.findIndex((i: any) => i.id === id)
    if (idx !== -1) {
      data[idx].value = replacer
    } else {
      data.push({ id, value: replacer })
    }
    this.db.setState(data).write()
  }

  async read(id: string) {
    const dbValue = this.db.value()
    const data = Array.isArray(dbValue) ? dbValue : []
    const row = data.find((i: any) => i.id === id)
    if (!row?.value) return null
    const creds = typeof row.value === 'object' ? toString(row.value) : row.value
    return JSON.parse(creds, BufferJSON.reviver)
  }

  async remove(id: string) {
    const dbValue = this.db.value()
    const data = Array.isArray(dbValue) ? dbValue : []
    const filtered = data.filter((i: any) => i.id !== id)
    this.db.setState(filtered).write()
  }

  async clear() {
    const dbValue = this.db.value()
    const data = Array.isArray(dbValue) ? dbValue : []
    const filtered = data.filter((i: any) => i.id === 'creds')
    this.db.setState(filtered).write()
  }

  async delete() {
    this.db.data = []
    await this.db.write()
  }
}
