/**
 * Mapping between a WhatsApp LID identity and its phone-number JID,
 * delivered as payload of the `lid-mapping.update` event (rc12+).
 */
export interface LIDMapping {
  readonly lid: string
  readonly pn: string
}

export type LIDMappingUpdatePayload = LIDMapping
