// Orkestrasi penyelesaian Embedded Signup (jalur FB JS SDK):
//   exchange code → discovery WABA (providedWabaId dari session-info) → pilih
//   nomor → simpan sesi → [jalur standar: register dgn PIN] → subscribe
//   webhook (SELALU) → eligible sync coexistence?
// Route /api/whatsapp/waba/exchange tinggal validasi + memanggil ini.

import { prisma } from '@/lib/prisma'

import { exchangeCodeForToken } from './oauth'
import { findPreviousPin, generateRegisterPin, storeSessionPin } from './pin'
import {
  discoverWaba,
  registerPhoneNumber,
  subscribeAppToWaba,
  type RegisterFailReason,
  type WabaPhoneNumber,
} from './resources'
import { upsertCloudSession } from './session-store'

export type OnboardWarningCode =
  RegisterFailReason | 'REGISTER_FAILED' | 'WEBHOOK_FAILED'

export interface CompleteSignupInput {
  userId: string
  code: string
  /** waba_id dari session-info wizard (SDK) — pilihan eksplisit user. */
  wabaId?: string
  /** phone_number_id dari session-info (jalur standar mengirimnya). */
  phoneNumberId?: string
  /** PIN two-step lama untuk nomor bekas (jalur standar). */
  pin?: string
}

export interface CompleteSignupData {
  sessionId: string
  phoneNumber: string | null
  displayName: string | null
  mode: 'COEXISTENCE' | 'STANDARD'
  /** PIN yang dibuat hulao — tampilkan SEKALI ke user. */
  generatedPin?: string
  /** true bila sync kontak/riwayat coexistence dijadwalkan. */
  syncScheduled: boolean
  warning?: string
  warningCode?: OnboardWarningCode
}

export type CompleteSignupResult =
  | { ok: true; data: CompleteSignupData }
  | { ok: false; status: 400 | 409 | 500; error: string }

/**
 * Pilih nomor: phone_number_id dari session-info (paling pasti) → nomor
 * coexistence → nomor CONNECTED → pertama. WABA bisa punya >1 nomor dan yang
 * baru di-onboard tidak selalu di indeks 0.
 */
export function pickPhone(
  phones: WabaPhoneNumber[],
  preferredId?: string,
): WabaPhoneNumber | undefined {
  return (
    (preferredId ? phones.find((p) => p.id === preferredId) : undefined) ??
    phones.find((p) => p.is_on_biz_app) ??
    phones.find((p) => p.status === 'CONNECTED') ??
    phones[0]
  )
}

export async function completeEmbeddedSignup(
  input: CompleteSignupInput,
): Promise<CompleteSignupResult> {
  const exchange = await exchangeCodeForToken(input.code)
  if (!exchange.ok || !exchange.accessToken) {
    console.error('[waba/onboarding] exchange code gagal:', exchange.error)
    return {
      ok: false,
      status: 400,
      error: `Gagal menukar kode Meta: ${exchange.error}`,
    }
  }
  return finishOnboardingWithToken({
    userId: input.userId,
    token: exchange.accessToken,
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId,
    pin: input.pin,
  })
}

export interface ManualTokenInput {
  userId: string
  /** Access token (System User / long-lived) milik user sendiri. */
  accessToken: string
  /** WABA ID yang mau dihubungkan (wajib untuk jalur manual). */
  wabaId: string
  phoneNumberId?: string
  pin?: string
}

/**
 * Hubungkan WABA lewat Access Token + WABA ID yang dimasukkan user sendiri
 * (jalur "Token Manual", untuk developer / migrasi dari platform lain). Sama
 * seperti Embedded Signup tapi TANPA tukar-kode OAuth — token dipakai langsung.
 */
export async function completeManualToken(
  input: ManualTokenInput,
): Promise<CompleteSignupResult> {
  const token = input.accessToken.trim()
  if (!token)
    return { ok: false, status: 400, error: 'Access token wajib diisi' }
  return finishOnboardingWithToken({
    userId: input.userId,
    token,
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId,
    pin: input.pin,
  })
}

// Logika bersama SETELAH token didapat (dari OAuth exchange atau input manual):
// discover WABA → pilih nomor → simpan sesi → register → subscribe webhook.
async function finishOnboardingWithToken(input: {
  userId: string
  token: string
  wabaId?: string
  phoneNumberId?: string
  pin?: string
}): Promise<CompleteSignupResult> {
  const token = input.token

  // WABA yang SUDAH BENAR-BENAR terhubung user ini (untuk WABA kedua). Hanya
  // CONNECTED — sesi ERROR dari percobaan gagal tidak boleh mengecualikan
  // WABA yang sedang di-retry.
  const existingWabaIds = (
    await prisma.whatsappSession.findMany({
      where: {
        userId: input.userId,
        wabaId: { not: null },
        status: 'CONNECTED',
      },
      select: { wabaId: true },
    })
  )
    .map((s) => s.wabaId)
    .filter((id): id is string => Boolean(id))

  const discovery = await discoverWaba({
    userToken: token,
    providedWabaId: input.wabaId,
    excludeWabaIds: existingWabaIds,
  })
  if (!discovery.ok) {
    console.error('[waba/onboarding] discovery gagal:', discovery.error)
    return { ok: false, status: 400, error: discovery.error }
  }

  const phone = pickPhone(discovery.waba.phoneNumbers, input.phoneNumberId)
  if (!phone)
    return { ok: false, status: 400, error: 'WABA tidak punya nomor telepon' }

  const isCoexistence = phone.is_on_biz_app === true
  const phoneDigits = phone.display_phone_number?.replace(/\D/g, '') ?? ''

  let created
  try {
    created = await upsertCloudSession({
      userId: input.userId,
      wabaId: discovery.waba.wabaId,
      phoneNumberId: phone.id,
      displayPhoneNumber: phone.display_phone_number ?? null,
      verifiedName: phone.verified_name ?? null,
      accessToken: token,
      tokenExpiresAt: discovery.waba.tokenExpiresAt,
      isCoexistence,
    })
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('terhubung ke akun lain'))
      return { ok: false, status: 409, error: msg }
    throw err
  }

  // ── Jalur standar: register dengan PIN ──
  let warning: string | undefined
  let warningCode: OnboardWarningCode | undefined
  let generatedPin: string | undefined
  const needsRegister = !isCoexistence && phone.status !== 'CONNECTED'
  if (needsRegister) {
    let pin = input.pin
    let generated = false
    if (!pin) {
      const previous = await findPreviousPin(input.userId, phoneDigits)
      if (previous) {
        pin = previous.pin
        generated = previous.generated
      } else {
        pin = generateRegisterPin()
        generated = true
      }
    }
    const reg = await registerPhoneNumber(phone.id, token, pin)
    if (reg.ok) {
      await storeSessionPin(created.id, pin, generated)
      if (generated) generatedPin = pin
    } else {
      console.error(
        `[waba/onboarding] register gagal (${reg.reason}):`,
        reg.error,
      )
      warning = reg.error
      warningCode = reg.reason
    }
  }

  // ── Subscribe webhook SELALU (meski register gagal) — override per-WABA
  // memastikan event masuk ke hulao; tanpa ini sesi mati tanpa jalur pulih.
  const sub = await subscribeAppToWaba(discovery.waba.wabaId, token)
  if (!sub.ok) {
    console.error('[waba/onboarding] subscribe webhook gagal:', sub.error)
    if (!warning) {
      warning = `Webhook belum aktif — subscribe app gagal: ${sub.error}`
      warningCode = 'WEBHOOK_FAILED'
    }
  }

  if (warning) {
    await prisma.whatsappSession.update({
      where: { id: created.id },
      data: { status: 'ERROR', lastError: warning },
    })
  }

  return {
    ok: true,
    data: {
      sessionId: created.id,
      phoneNumber: created.phoneNumber,
      displayName: created.displayName,
      mode: isCoexistence ? 'COEXISTENCE' : 'STANDARD',
      generatedPin,
      syncScheduled: isCoexistence && sub.ok,
      warning,
      warningCode,
    },
  }
}
