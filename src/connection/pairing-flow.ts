import type { BaileysSocket } from '../client/types.js'

export interface PairingFlowOptions {
  phoneNumber: string
  ttlMs?: number
}

export interface PairingFlowResult {
  code: string
  expiresAt: number
}

export interface PairingFlow {
  readonly phoneNumber: string
  requestCode(socket: Pick<BaileysSocket, 'requestPairingCode'>): Promise<PairingFlowResult>
}

const DEFAULT_TTL_MS = 60_000
const MIN_E164_DIGITS = 8
const MAX_E164_DIGITS = 15
const STRIP_PATTERN = /[\s\-()+]/g

export function normalizePhoneNumber(raw: string): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(STRIP_PATTERN, '')
}

export function validateE164(raw: string): string {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    throw new Error('phoneNumber is required')
  }
  const normalized = normalizePhoneNumber(raw)
  if (!/^\d+$/.test(normalized)) {
    throw new Error('phoneNumber must be E.164 with country code')
  }
  if (normalized.length < MIN_E164_DIGITS || normalized.length > MAX_E164_DIGITS) {
    throw new Error('phoneNumber must be E.164 with country code')
  }
  return normalized
}

export function createPairingFlow(options: PairingFlowOptions): PairingFlow {
  const normalized = validateE164(options.phoneNumber)
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  return {
    phoneNumber: normalized,
    async requestCode(socket) {
      let code: string
      try {
        code = await socket.requestPairingCode(normalized)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(`failed to request pairing code: ${msg}`)
      }
      return { code, expiresAt: Date.now() + ttlMs }
    },
  }
}
