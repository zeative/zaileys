/**
 * Placeholder for media transformers (e.g. resizing, thumbnail generation).
 * In a real implementation, this would use sharp/ffmpeg.
 */
export async function mediaTransformer(payload: any, next: () => Promise<void>) {
  if (payload.image || payload.video) {
    // Logic for auto-thumbnail generation would go here
  }
  await next()
}
