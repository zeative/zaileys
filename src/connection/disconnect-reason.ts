/** Domain-level disconnect reason normalized from Baileys integer enum. */
export type DisconnectReasonDomain =
  | 'logged-out'
  | 'connection-replaced'
  | 'forbidden'
  | 'restart-required'
  | 'bad-session'
  | 'connection-closed'
  | 'connection-lost'
  | 'multi-device-mismatch'
  | 'unavailable-service'
  | 'unknown'
