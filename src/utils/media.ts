import { existsSync, readFileSync } from 'node:fs'

/**
 * Media utilities for Zaileys V4.
 * Standardizes media input for the Transformer pipeline.
 */

export type MediaSource = string | Buffer

export interface CleanMedia {
  data: Buffer
  mimetype?: string
  filename?: string
}

/**
 * Resolves a media source (URL, Path, or Buffer) into a Buffer.
 * Note: This is a synchronous version for basic cleanup. 
 * Async fetching should be handled by the Transformer pipeline.
 */
export function cleanMediaObject(source: MediaSource): Buffer {
  if (Buffer.isBuffer(source)) {
    return source
  }

  if (typeof source === 'string') {
    // Check if it's a local file path
    if (existsSync(source)) {
      return readFileSync(source)
    }

    // Check if it's a base64 string
    if (source.startsWith('data:')) {
      return Buffer.from(source.split(',')[1], 'base64')
    }

    // It might be a URL string, but we can't synchronously fetch it here.
    // The Transformer will handle async fetching if this returns a string or similar.
    // For now, we return a Buffer or throw if invalid local path.
    throw new Error(`Cannot resolve media source: ${source}. URLs must be handled by the Transformer pipeline.`)
  }

  throw new Error('Unsupported media source type.')
}
