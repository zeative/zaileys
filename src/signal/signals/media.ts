import type { MessageContent } from '../../types/context'

/**
 * Image signal.
 */
export function image(content: string | Buffer, options: any = {}) {
  return (engine: any) => ({
    image: typeof content === 'string' ? { url: content } : content,
    caption: options.caption,
    ...options
  })
}

/**
 * Video signal.
 */
export function video(content: string | Buffer, options: any = {}) {
  return (engine: any) => ({
    video: typeof content === 'string' ? { url: content } : content,
    caption: options.caption,
    ...options
  })
}

/**
 * Audio signal.
 */
export function audio(content: string | Buffer, options: any = {}) {
  return (engine: any) => ({
    audio: typeof content === 'string' ? { url: content } : content,
    ptt: options.ptt ?? false,
    ...options
  })
}

/**
 * Document signal.
 */
export function document(content: string | Buffer, options: any = {}) {
  return (engine: any) => ({
    document: typeof content === 'string' ? { url: content } : content,
    fileName: options.fileName,
    mimetype: options.mimetype,
    ...options
  })
}
