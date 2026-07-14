import { ZaileysCloudError } from './errors.js'
import type { CloudOptions } from './types.js'

/** Pinned default Graph API version — override via CloudOptions.apiVersion. */
export const DEFAULT_GRAPH_VERSION = 'v23.0'
export const DEFAULT_GRAPH_BASE_URL = 'https://graph.facebook.com'

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

export function createGraphClient(options: CloudOptions, deps?: GraphClientDeps): GraphClient {
  const baseUrl = options.baseUrl ?? DEFAULT_GRAPH_BASE_URL
  const apiVersion = options.apiVersion ?? DEFAULT_GRAPH_VERSION
  const delay = deps?.delay ?? sleep

  const url = (path: string): string => `${baseUrl}/${apiVersion}/${path}`

  const request = async <T>(path: string, init: RequestInit): Promise<T> => {
    let lastError: ZaileysCloudError | undefined
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res: Response
      try {
        res = await fetch(url(path), {
          ...init,
          headers: { Authorization: `Bearer ${options.accessToken}`, ...(init.headers as Record<string, string>) },
        })
      } catch (err) {
        throw new ZaileysCloudError('REQUEST_FAILED', 'graph request failed (network)', { cause: err })
      }
      if (res.ok) {
        return (await res.json().catch(() => ({}))) as T
      }
      const body = (await res.json().catch(() => ({}))) as GraphErrorBody
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
