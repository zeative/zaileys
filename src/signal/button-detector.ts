/**
 * Detects the most appropriate button type for a payload.
 * Priority: Carousel > List > Interactive > Simple
 */
export function detectButtonType(payload: any): 'simple' | 'interactive' | 'carousel' | 'list' {
  if (payload.cards) return 'carousel'
  if (payload.sections) return 'list'
  
  const buttons = payload.buttons || []
  const hasInteractive = buttons.some((b: any) => b.url || b.call || b.copy)
  
  if (hasInteractive) return 'interactive'
  return 'simple'
}
