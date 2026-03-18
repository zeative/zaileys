import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'

/**
 * Manages multiple WhatsApp sessions.
 */
export class SessionManager {
  constructor(private sessionsDir: string) {
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true })
    }
  }

  /**
   * Get the directory for a specific session.
   */
  getPath(sessionId: string): string {
    return join(this.sessionsDir, sessionId)
  }

  /**
   * List all stored sessions.
   */
  list(): string[] {
    return readdirSync(this.sessionsDir)
  }

  /**
   * Delete a session.
   */
  delete(sessionId: string) {
    const path = this.getPath(sessionId)
    if (existsSync(path)) {
      rmSync(path, { recursive: true })
    }
  }

  /**
   * Check if session exists.
   */
  exists(sessionId: string): boolean {
    return existsSync(this.getPath(sessionId))
  }
}
