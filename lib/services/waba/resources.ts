// Resource discovery pasca Embedded Signup: temukan WABA ID dari token user,
// tarik detail WABA + daftar nomor, dan subscribe app ke WABA (webhook).

import { appAccessToken, graphRequest } from './graph'

export interface WabaPhoneNumber {
  id: string // phone_number_id
  display_phone_number?: string
  verified_name?: string
  quality_rating?: string
  status?: string
}

export interface DiscoveredWaba {
  wabaId: string
  name?: string
  phoneNumbers: WabaPhoneNumber[]
}

interface DebugTokenResponse {
  data?: {
    granular_scopes?: { scope: string; target_ids?: string[] }[]
  }
}

/**
 * Temukan WABA ID yang di-grant token user. Prioritas:
 * 1. providedWabaId (dari session-info SDK di frontend, bila ada)
 * 2. target_id yang BELUM ada di excludeWabaIds (dukungan koneksi WABA kedua)
 * 3. target_id pertama
 */
export async function discoverWaba(input: {
  userToken: string
  providedWabaId?: string | null
  excludeWabaIds?: string[]
}): Promise<{ ok: true; waba: DiscoveredWaba } | { ok: false; error: string }> {
  const debug = await graphRequest<DebugTokenResponse>(
    `/debug_token?input_token=${encodeURIComponent(input.userToken)}`,
    { token: appAccessToken() },
  )
  if (!debug.ok) return { ok: false, error: `debug_token gagal: ${debug.error.message}` }

  const scopes = debug.data.data?.granular_scopes ?? []
  const managementScope = scopes.find((s) => s.scope === 'whatsapp_business_management')
  const targetIds = managementScope?.target_ids ?? []
  if (targetIds.length === 0) {
    return { ok: false, error: 'Token tidak punya akses WABA mana pun (granular_scopes kosong)' }
  }

  const exclude = new Set(input.excludeWabaIds ?? [])
  const wabaId =
    (input.providedWabaId && targetIds.includes(input.providedWabaId)
      ? input.providedWabaId
      : undefined) ??
    targetIds.find((id) => !exclude.has(id)) ??
    targetIds[0]

  const [details, phones] = await Promise.all([
    graphRequest<{ id: string; name?: string }>(`/${wabaId}?fields=id,name`, {
      token: input.userToken,
    }),
    graphRequest<{ data?: WabaPhoneNumber[] }>(
      `/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status`,
      { token: input.userToken },
    ),
  ])

  if (!phones.ok) {
    return { ok: false, error: `Gagal ambil daftar nomor WABA: ${phones.error.message}` }
  }
  const phoneNumbers = phones.data.data ?? []
  if (phoneNumbers.length === 0) {
    return { ok: false, error: 'WABA tidak punya nomor telepon — selesaikan penambahan nomor di Embedded Signup' }
  }

  return {
    ok: true,
    waba: {
      wabaId,
      name: details.ok ? details.data.name : undefined,
      phoneNumbers,
    },
  }
}

/**
 * Subscribe aplikasi ke WABA — tanpa ini webhook pesan tidak akan dikirim
 * Meta ke server kita. Idempoten (subscribe ulang aman).
 */
export async function subscribeAppToWaba(
  wabaId: string,
  userToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await graphRequest<{ success?: boolean }>(`/${wabaId}/subscribed_apps`, {
    method: 'POST',
    token: userToken,
  })
  if (!res.ok) return { ok: false, error: res.error.message }
  return { ok: true }
}
