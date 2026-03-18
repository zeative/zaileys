import { createHash } from 'node:crypto'

/**
 * ID utilities for Zaileys V4.
 * Provides hashing and unique ID generation for message dedup and tracking.
 */

/**
 * Generates a consistent hash from any string or buffer.
 * @param input The data to hash.
 * @returns A SHA-256 hash string.
 */
export function generateHash(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Generates a unique identifier for a message based on its room, sender, and content.
 * @param roomId The room ID.
 * @param senderId The sender ID.
 * @param content The message content or timestamp.
 * @returns A unique hash string.
 */
export function generateId(roomId: string, senderId: string, content: string | number): string {
  return generateHash(`${roomId}:${senderId}:${content}`)
}

/**
 * Generates a random unique ID (for internal use, not consistent).
 */
export function randomId(): string {
  return Math.random().toString(36).substring(2, 11).toUpperCase()
}
