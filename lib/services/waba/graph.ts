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

// ── Trek 2B ──

interface GraphPagedResponse<T> {
  data?: T[]
  paging?: { cursors?: { before?: string; after?: string }; next?: string }
}

// Batas halaman — jaring pengaman supaya WABA dengan ribuan template tidak
// membuat cron/webhook berjalan tanpa akhir (jebakan referensi: tanpa paging).
const MAX_PAGES = 20

/**
 * GET berhalaman: ikuti `paging.next` sampai habis atau MAX_PAGES. Hasil
 * digabung jadi satu array. Path pertama boleh sudah memuat query string.
 */
export async function graphRequestPaged<T>(
  path: string,
  init: { token: string; timeoutMs?: number },
): Promise<GraphResult<T[]> & { truncated?: boolean }> {
  let baseUrl: string
  try {
    baseUrl = getMetaConfig().graphBaseUrl
  } catch (err) {
    return { ok: false, error: { message: (err as Error).message } }
  }

  const all: T[] = []
  let nextUrl: string | null = `${baseUrl}${path}`
  let pages = 0
  while (nextUrl && pages < MAX_PAGES) {
    pages += 1
    // `paging.next` = URL absolut; kurangi ke path relatif supaya lewat
    // graphRequest (header Bearer, timeout, normalisasi error).
    const rel: string = nextUrl.startsWith(baseUrl) ? nextUrl.slice(baseUrl.length) : nextUrl
    const res: GraphResult<GraphPagedResponse<T>> = await graphRequest<GraphPagedResponse<T>>(rel, {
      token: init.token,
      timeoutMs: init.timeoutMs,
    })
    if (!res.ok) return res
    all.push(...(res.data.data ?? []))
    const next: string | undefined = res.data.paging?.next
    // `paging.next` dari Meta membawa access_token di query — strip supaya
    // tidak bocor ke log; token tetap dikirim via header.
    nextUrl = next ? next.replace(/([?&])access_token=[^&]*&?/, '$1').replace(/[?&]$/, '') : null
  }
  return { ok: true, data: all, truncated: Boolean(nextUrl) }
}

/**
 * Upload biner (Resumable Upload API: `POST /{upload_id}` dengan header
 * `Authorization: OAuth <token>` dan `file_offset`). Tidak JSON.
 */
export async function graphUploadBinary<T>(
  path: string,
  init: { token: string; body: Buffer; fileOffset?: number; timeoutMs?: number },
): Promise<GraphResult<T>> {
  let baseUrl: string
  try {
    baseUrl = getMetaConfig().graphBaseUrl
  } catch (err) {
    return { ok: false, error: { message: (err as Error).message } }
  }
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${init.token}`,
        file_offset: String(init.fileOffset ?? 0),
        'Content-Type': 'application/octet-stream',
      },
      body: new Uint8Array(init.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(init.timeoutMs ?? 120_000),
    })
    const json = (await res.json().catch(() => null)) as
      | (Record<string, unknown> & {
          error?: { code?: number; error_subcode?: number; message?: string; type?: string }
        })
      | null
    if (!res.ok || json?.error) {
      const e = json?.error
      return {
        ok: false,
        error: {
          code: e?.code,
          subcode: e?.error_subcode,
          message: e?.message ?? `Graph upload ${res.status}`,
          type: e?.type,
          httpStatus: res.status,
        },
      }
    }
    if (json === null) {
      return { ok: false, error: { message: 'Graph upload: respons bukan JSON', httpStatus: res.status } }
    }
    return { ok: true, data: json as T }
  } catch (err) {
    return { ok: false, error: { message: `Graph upload gagal: ${(err as Error).message}` } }
  }
}
