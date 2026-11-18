import { clampTimerDelay } from '../utils/timer.js'
import { ZaileysCloudError } from './errors.js'
import type { CloudOptions } from './types.js'

/** Pinned default Graph API version — override via CloudOptions.apiVersion. */
export const DEFAULT_GRAPH_VERSION = 'v23.0'
export const DEFAULT_GRAPH_BASE_URL = 'https://graph.facebook.com'
/** Default for `CloudOptions.requestTimeoutMs`. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number }
}

export interface GraphClientDeps {
  delay?: (ms: number) => Promise<void>
}

export interface GraphClient {
  get<T>(path: string): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
  postForm<T>(path: string, form: FormData): Promise<T>
  delete<T = unknown>(path: string, body?: unknown): Promise<T>
  url(path: string): string
}

const MAX_ATTEMPTS = 3
const RETRY_BASE_MS = 500

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export const resolveRequestTimeoutMs = (options: CloudOptions): number =>
  clampTimerDelay(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS)

export const requestTimeoutError = (label: string, timeoutMs: number, cause?: unknown): ZaileysCloudError =>
  new ZaileysCloudError(
    'REQUEST_FAILED',
    `${label} timed out after ${timeoutMs} ms; raise cloud.requestTimeoutMs if the network is slow`,
    cause === undefined ? undefined : { cause },
  )

interface GraphResponse {
  res: Response
  body: unknown
}

export function createGraphClient(options: CloudOptions, deps?: GraphClientDeps): GraphClient {
  const baseUrl = options.baseUrl ?? DEFAULT_GRAPH_BASE_URL
  const apiVersion = options.apiVersion ?? DEFAULT_GRAPH_VERSION
  const delay = deps?.delay ?? sleep
  const timeoutMs = resolveRequestTimeoutMs(options)

  /**
   * Path segments come from remote data (media ids, phone-number ids). Encoding each one stops a
   * value like `../../v1.0/x` from re-pointing an authenticated request at a different node.
   */
  const encodePath = (path: string): string =>
    path
      .split('?')[0] === path
      ? path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
      : `${(path.split('?')[0] ?? '').split('/').map((segment) => encodeURIComponent(segment)).join('/')}?${path.slice(path.indexOf('?') + 1)}`

  const url = (path: string): string => `${baseUrl}/${apiVersion}/${encodePath(path)}`

  /** The signal stays armed until the body is read, so a response that stalls mid-body also times out. */
  const send = async (path: string, init: RequestInit): Promise<GraphResponse> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url(path), {
        ...init,
        headers: { Authorization: `Bearer ${options.accessToken}`, ...(init.headers as Record<string, string>) },
        signal: controller.signal,
      })
      const body: unknown = await res.json().catch(() => ({}))
      if (controller.signal.aborted) throw requestTimeoutError('graph request', timeoutMs, controller.signal.reason)
      return { res, body }
    } catch (err) {
      if (err instanceof ZaileysCloudError) throw err
      if (controller.signal.aborted) throw requestTimeoutError('graph request', timeoutMs, err)
      throw new ZaileysCloudError('REQUEST_FAILED', 'graph request failed (network)', { cause: err })
    } finally {
      clearTimeout(timer)
    }
  }

  const request = async <T>(path: string, init: RequestInit): Promise<T> => {
    let lastError: ZaileysCloudError | undefined
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const { res, body: raw } = await send(path, init)
      if (res.ok) return raw as T
      const body = raw as GraphErrorBody
      const detail = body.error?.message ?? `http ${res.status}`
      const meta = body.error ? ` (code ${body.error.code ?? '?'}${body.error.error_subcode ? `/${body.error.error_subcode}` : ''})` : ''
      if (res.status === 401 || res.status === 403) {
        throw new ZaileysCloudError('AUTH', `graph auth rejected: ${detail}${meta}`)
      }
      const retryable = res.status === 429 || res.status >= 500
      const errCode = res.status === 429 ? 'RATE_LIMITED' : 'REQUEST_FAILED'
      lastError = new ZaileysCloudError(errCode, `graph request failed: ${detail}${meta}`)
      if (!retryable) throw lastError
      if (attempt < MAX_ATTEMPTS) await delay(RETRY_BASE_MS * 2 ** (attempt - 1))
    }
    throw lastError ?? new ZaileysCloudError('REQUEST_FAILED', 'graph request failed')
  }

  return {
    url,
    get: <T>(path: string) => request<T>(path, { method: 'GET' }),
    post: <T>(path: string, body: unknown) =>
      request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    postForm: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
    delete: <T>(path: string, body?: unknown) =>
      request<T>(path, {
        method: 'DELETE',
        ...(body !== undefined
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          : {}),
      }),
  }
}
