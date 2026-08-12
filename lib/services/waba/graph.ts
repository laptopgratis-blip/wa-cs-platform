// Klien tipis Graph API Meta. Token SELALU di header Authorization Bearer
// (bukan query param — query param bocor di access log/proxy).

import { getMetaConfig } from './config'

export interface MetaApiError {
  /** Kode error Meta, mis. 190 (token invalid), 131047 (window 24 jam). */
  code?: number
  subcode?: number
  message: string
  type?: string
  fbtraceId?: string
  httpStatus?: number
}

export type GraphResult<T> = { ok: true; data: T } | { ok: false; error: MetaApiError }

interface GraphRequestInit {
  method?: 'GET' | 'POST' | 'DELETE'
  /** Access token — user token per sesi, atau app token `appId|appSecret`. */
  token: string
  body?: unknown
  timeoutMs?: number
}

/**
 * Panggil Graph API. TIDAK PERNAH throw — semua kegagalan (network, timeout,
 * error Meta) dinormalisasi jadi { ok: false, error }.
 */
export async function graphRequest<T>(
  path: string,
  init: GraphRequestInit,
): Promise<GraphResult<T>> {
  let baseUrl: string
  try {
    baseUrl = getMetaConfig().graphBaseUrl
  } catch (err) {
    return { ok: false, error: { message: (err as Error).message } }
  }

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${init.token}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
    })

    const json = (await res.json().catch(() => null)) as
      | (Record<string, unknown> & {
          error?: {
            code?: number
            error_subcode?: number
            message?: string
            type?: string
            fbtrace_id?: string
          }
        })
      | null

    if (!res.ok || json?.error) {
      const e = json?.error
      return {
        ok: false,
        error: {
          code: e?.code,
          subcode: e?.error_subcode,
          message: e?.message ?? `Graph API ${res.status}`,
          type: e?.type,
          fbtraceId: e?.fbtrace_id,
          httpStatus: res.status,
        },
      }
    }
    if (json === null) {
      return { ok: false, error: { message: 'Graph API: respons bukan JSON', httpStatus: res.status } }
    }
    return { ok: true, data: json as T }
  } catch (err) {
    return {
      ok: false,
      error: { message: `Graph API tidak bisa dihubungi: ${(err as Error).message}` },
    }
  }
}

/** Token level aplikasi untuk endpoint debug_token dkk. */
export function appAccessToken(): string {
  const cfg = getMetaConfig()
  return `${cfg.appId}|${cfg.appSecret}`
}
