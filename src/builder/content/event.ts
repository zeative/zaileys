import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import type { EventOptions } from '../types.js'

const toDate = (value: Date | number, field: string): Date => {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', `event() ${field} must be a valid Date or epoch ms`)
  }
  // snap to whole seconds so baileys' getTime()/1000 stays an integer timestamp
  return new Date(Math.floor(d.getTime() / 1000) * 1000)
}

export const buildEventContent = (opts: EventOptions): AnyMessageContent => {
  if (opts == null || typeof opts.name !== 'string' || opts.name.trim().length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'event() requires a non-empty name')
  }
  const event = {
    name: opts.name,
    startDate: toDate(opts.startAt, 'startAt'),
    ...(opts.description !== undefined ? { description: opts.description } : {}),
    ...(opts.endAt !== undefined ? { endDate: toDate(opts.endAt, 'endAt') } : {}),
    ...(opts.call !== undefined ? { call: opts.call } : {}),
    ...(opts.canceled !== undefined ? { isCancelled: opts.canceled } : {}),
    ...(opts.location !== undefined
      ? {
          location: {
            degreesLatitude: opts.location.latitude,
            degreesLongitude: opts.location.longitude,
            ...(opts.location.name !== undefined ? { name: opts.location.name } : {}),
            ...(opts.location.address !== undefined ? { address: opts.location.address } : {}),
          },
        }
      : {}),
  }
  return { event } as unknown as AnyMessageContent
}
