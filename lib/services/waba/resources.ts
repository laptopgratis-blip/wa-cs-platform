// Resource discovery pasca Embedded Signup: temukan WABA ID dari token user,
// tarik detail WABA + daftar nomor, dan subscribe app ke WABA (webhook).

import { decrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'
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
  /**
   * Kedaluwarsa token per debug_token (SUMBER KEBENARAN). null = never-expire
   * (token ES sering begitu; jangan dipaksa 60 hari — cron akan mencoba
   * refresh yang tak perlu lalu meng-ERROR-kan sesi sehat).
   */
  tokenExpiresAt: Date | null
}

interface DebugTokenResponse {
  data?: {
    granular_scopes?: { scope: string; target_ids?: string[] }[]
    /** unix detik; 0 = token tidak kedaluwarsa (never-expire). */
    expires_at?: number
    is_valid?: boolean
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

  let wabaId: string
  if (input.providedWabaId) {
    // WABA ID dari session-info wizard = pilihan eksplisit user. Pakai
    // langsung — Graph API yang menegakkan akses (phone_numbers akan gagal
    // jelas kalau token tak berhak). Jangan diam-diam ganti ke heuristik.
    wabaId = input.providedWabaId
    if (!targetIds.includes(wabaId)) {
      console.warn(
        `[waba/discovery] providedWabaId ${wabaId} tidak ada di granular_scopes ${JSON.stringify(targetIds)} — tetap dipakai`,
      )
    }
  } else {
    if (targetIds.length === 0) {
      return { ok: false, error: 'Token tidak punya akses WABA mana pun (granular_scopes kosong)' }
    }
    // Heuristik: permission FB Login for Business terakumulasi per (user,app),
    // jadi target_ids bisa berisi WABA dari percobaan/platform lain. Urutan
    // TIDAK dijamin Meta. Pilih yang belum terhubung; log kalau ambigu supaya
    // salah pilih terlihat di server, bukan senyap.
    const exclude = new Set(input.excludeWabaIds ?? [])
    const candidates = targetIds.filter((id) => !exclude.has(id))
    wabaId = candidates[0] ?? targetIds[0]
    if (targetIds.length > 1) {
      console.warn(
        `[waba/discovery] tanpa providedWabaId, target_ids=${JSON.stringify(targetIds)} exclude=${JSON.stringify([...exclude])} → dipilih ${wabaId}`,
      )
    }
  }

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

  const expiresAt = debug.data.data?.expires_at
  const tokenExpiresAt =
    typeof expiresAt === 'number' && expiresAt > 0 ? new Date(expiresAt * 1000) : null

  return {
    ok: true,
    waba: {
      wabaId,
      name: details.ok ? details.data.name : undefined,
      phoneNumbers,
      tokenExpiresAt,
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

/**
 * Lepas subscription app dari WABA milik sesi (DELETE /{waba}/subscribed_apps).
 * Dipanggil saat user "Hapus & logout" sesi Cloud API. Best-effort: kalau
 * token sudah tidak valid, biarkan — sesi tetap di-wipe di DB.
 */
export async function unsubscribeAppFromWaba(sessionId: string): Promise<void> {
  const s = await prisma.whatsappSession.findUnique({
    where: { id: sessionId },
    select: { wabaId: true, wabaTokenEnc: true },
  })
  if (!s?.wabaId || !s.wabaTokenEnc) return
  // Kalau WABA yang sama masih dipakai sesi cloud lain milik user (multi
  // nomor), JANGAN unsubscribe — sesi lain masih butuh webhook-nya.
  const others = await prisma.whatsappSession.count({
    where: { wabaId: s.wabaId, provider: 'CLOUD_API', isActive: true, id: { not: sessionId } },
  })
  if (others > 0) return
  const token = decrypt(s.wabaTokenEnc)
  const res = await graphRequest<{ success?: boolean }>(`/${s.wabaId}/subscribed_apps`, {
    method: 'DELETE',
    token,
  })
  if (!res.ok) console.warn(`[waba] unsubscribe WABA ${s.wabaId} gagal: ${res.error.message}`)
}
