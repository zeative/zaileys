import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import type { LocationOptions } from '../types.js'

export type LocationContent = {
  location: {
    degreesLatitude: number
    degreesLongitude: number
    name?: string
    address?: string
  }
}

export const buildLocationContent = (
  lat: number,
  lon: number,
  opts?: LocationOptions,
): AnyMessageContent => {
  if (typeof lat !== 'number' || Number.isNaN(lat) || lat < -90 || lat > 90) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', `location() latitude must be within -90..90, got ${String(lat)}`)
  }
  if (typeof lon !== 'number' || Number.isNaN(lon) || lon < -180 || lon > 180) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', `location() longitude must be within -180..180, got ${String(lon)}`)
  }
  const location: LocationContent['location'] = {
    degreesLatitude: lat,
    degreesLongitude: lon,
  }
  if (opts?.name !== undefined) location.name = opts.name
  if (opts?.address !== undefined) location.address = opts.address
  return { location } as unknown as AnyMessageContent
}
