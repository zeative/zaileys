/**
 * Baileys 7.0.0-rc14 rebuilds a download on the host of the message `url`, and some stickers, voice notes
 * and images carry this unresolvable placeholder there. Fixed upstream in WhiskeySockets/Baileys#2900,
 * not yet released; drop this once the pinned baileys includes it.
 */
const PLACEHOLDER_MEDIA_HOST = 'a.whatsapp.net'
const DEFAULT_MEDIA_HOST = 'mmg.whatsapp.net'

const hostOf = (url: string): string | undefined => {
  try {
    return new URL(url).host
  } catch {
    return undefined
  }
}

/** Download options for baileys `downloadMediaMessage` that keep a placeholder-host `url` off the network. */
export const mediaDownloadOptions = (content: unknown): { host?: string } => {
  if (content == null || typeof content !== 'object') return {}
  for (const node of Object.values(content)) {
    const url = node != null && typeof node === 'object' ? (node as { url?: unknown }).url : undefined
    if (typeof url === 'string' && hostOf(url) === PLACEHOLDER_MEDIA_HOST) return { host: DEFAULT_MEDIA_HOST }
  }
  return {}
}
