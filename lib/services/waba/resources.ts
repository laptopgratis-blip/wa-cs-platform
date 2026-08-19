// Resource discovery pasca Embedded Signup: temukan WABA ID dari token user,
// tarik detail WABA + daftar nomor, dan subscribe app ke WABA (webhook).

import { getMetaConfig } from './config'
import { appAccessToken, graphRequest } from './graph'

export interface WabaPhoneNumber {
  id: string // phone_number_id
  display_phone_number?: string
  verified_name?: string
  quality_rating?: string
  status?: string
  /** true = nomor juga hidup di aplikasi WA Business di HP (coexistence). */
  is_on_biz_app?: boolean
  /** CLOUD_API | ON_PREMISE | NOT_APPLICABLE */
  platform_type?: string
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
      `/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status,is_on_biz_app,platform_type`,
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
 *
 * PENTING: pakai override_callback_uri per-WABA. Callback level-aplikasi di
 * Meta App bisa menunjuk ke sistem lain (satu Meta App dipakai beberapa
 * platform) — override memastikan event WABA yang di-onboard lewat hulao
 * selalu dikirim ke webhook hulao. Meta memverifikasi URL override (GET
 * hub.challenge) saat call ini, jadi endpoint webhook harus sudah live.
 */
export async function subscribeAppToWaba(
  wabaId: string,
  userToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = getMetaConfig()
  const res = await graphRequest<{ success?: boolean }>(`/${wabaId}/subscribed_apps`, {
    method: 'POST',
    token: userToken,
    body: {
      override_callback_uri: cfg.webhookUrl,
      verify_token: cfg.verifyToken,
    },
  })
  if (!res.ok) return { ok: false, error: res.error.message }
  return { ok: true }
}

// Nomor masih terpasang di akun WhatsApp lain (aplikasi WA di HP).
const NUMBER_STILL_ATTACHED_SUBCODE = 2388001

/**
 * Register nomor ke infrastruktur Cloud API — WAJIB setelah Embedded Signup.
 * Tanpa ini status nomor tetap PENDING dan Meta membuang semua pesan masuk
 * (ES hanya menambahkan nomor ke WABA, TIDAK meregistrasinya — pelajaran
 * dari kasus nyata; asumsi kirimchat bahwa ES otomatis register itu salah).
 * Untuk nomor tanpa 2FA sebelumnya, PIN ini DISET sebagai PIN barunya.
 */
export async function registerPhoneNumber(
  phoneNumberId: string,
  userToken: string,
): Promise<{ ok: boolean; numberStillAttached?: boolean; error?: string }> {
  const cfg = getMetaConfig()
  const res = await graphRequest<{ success?: boolean }>(`/${phoneNumberId}/register`, {
    method: 'POST',
    token: userToken,
    body: { messaging_product: 'whatsapp', pin: cfg.registerPin },
  })
  if (!res.ok) {
    if (res.error.subcode === NUMBER_STILL_ATTACHED_SUBCODE) {
      return {
        ok: false,
        numberStillAttached: true,
        error:
          'Nomor masih aktif di aplikasi WhatsApp Business di HP. Hubungkan ulang dan ' +
          'pilih "Hubungkan Aplikasi WhatsApp Business" (nomor tetap bisa dipakai di HP), ' +
          'atau hapus akun WA di HP dulu (Pengaturan → Akun → Hapus akun) lalu ulangi.',
      }
    }
    return { ok: false, error: `Register nomor gagal: ${res.error.message}` }
  }
  return { ok: true }
}

/**
 * Pastikan override webhook per-WABA masih menunjuk ke hulao. Pada Meta App
 * yang dipakai bersama platform lain, POST subscribed_apps ber-body kosong
 * dari platform itu (onboarding ulang / cron re-subscribe) MENGHAPUS override
 * kita secara diam-diam → pesan berhenti masuk tanpa jejak. Dipanggil sebelum
 * pipeline butuh webhook (mis. cron) dan bisa dipanggil idempoten.
 */
export async function ensureWebhookOverride(
  wabaId: string,
  userToken: string,
): Promise<{ ok: boolean; repaired: boolean; error?: string }> {
  const cfg = getMetaConfig()
  const cur = await graphRequest<{ data?: { override_callback_uri?: string }[] }>(
    `/${wabaId}/subscribed_apps`,
    { token: userToken },
  )
  if (!cur.ok) return { ok: false, repaired: false, error: cur.error.message }
  const mine = cur.data.data?.find((d) => d.override_callback_uri === cfg.webhookUrl)
  if (mine) return { ok: true, repaired: false }
  const sub = await subscribeAppToWaba(wabaId, userToken)
  return { ok: sub.ok, repaired: sub.ok, error: sub.error }
}
