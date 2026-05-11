// Dual-send OTP auth: email (wajib) + WhatsApp (best-effort).
// - WA pakai session di env OTP_WA_SESSION_ID (nomor dedicated). Fallback:
//   session CONNECTED milik ADMIN (sama pola dgn lib/services/lms/wa-otp-sender.ts).
// - Email pakai sendAuthOtpEmail di lib/email.ts. Kalau gagal lempar
//   error supaya endpoint return 500 — kita tidak boleh kasih response
//   sukses tanpa channel apapun terkirim.
import { sendAuthOtpEmail } from '@/lib/email'
import type { OtpMode } from '@/lib/otp/auth-otp'
import { prisma } from '@/lib/prisma'
import { getSetting } from '@/lib/settings'
import { waService } from '@/lib/wa-service'

const OTP_BRAND = 'Hulao'

// Prioritas pengirim OTP WA:
// 1. Setting DB `OTP_WA_SESSION_ID` (di-set admin via /admin/settings) —
//    ini sumber kebenaran. Operasional gampang: admin pilih dari dropdown,
//    tidak perlu redeploy.
// 2. Env var `OTP_WA_SESSION_ID` — backward-compat / bootstrap.
// 3. Fallback: sesi CONNECTED milik admin (any), pattern lama dari LMS OTP.
async function findOtpWaSessionId(): Promise<string | null> {
  const dbId = (await getSetting('OTP_WA_SESSION_ID')).trim()
  if (dbId) {
    const session = await prisma.whatsappSession.findFirst({
      where: { id: dbId, status: 'CONNECTED' },
      select: { id: true },
    })
    if (session) return session.id
    console.warn(
      `[auth-otp-sender] OTP_WA_SESSION_ID (DB)=${dbId} tidak CONNECTED, fallback berikutnya.`,
    )
  }
  const envId = process.env.OTP_WA_SESSION_ID?.trim()
  if (envId) {
    const session = await prisma.whatsappSession.findFirst({
      where: { id: envId, status: 'CONNECTED' },
      select: { id: true },
    })
    if (session) return session.id
    console.warn(
      `[auth-otp-sender] OTP_WA_SESSION_ID (env)=${envId} tidak CONNECTED, fallback admin.`,
    )
  }
  const session = await prisma.whatsappSession.findFirst({
    where: { status: 'CONNECTED', user: { role: 'ADMIN' } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  return session?.id ?? null
}

function buildWaMessage(code: string, mode: OtpMode): string {
  const purpose =
    mode === 'SIGNUP' ? 'verifikasi pendaftaran akun' : 'login ke akun kamu'
  return [
    `*${OTP_BRAND}*`,
    '',
    `Kode OTP untuk ${purpose}: *${code}*`,
    'Berlaku 5 menit.',
    '',
    'Abaikan pesan ini kalau bukan kamu yg minta.',
  ].join('\n')
}

export interface DualSendResult {
  emailSent: boolean
  waSent: boolean
  emailError?: string
  waError?: string
}

export class OtpDeliveryFailedError extends Error {
  constructor(
    public emailError: string,
    public waError: string,
  ) {
    super(
      `Kedua channel gagal: email=${emailError}; wa=${waError}. Cek konfigurasi SMTP & WA session.`,
    )
  }
}

// Send OTP ke email + WhatsApp paralel. Email & WA dua-duanya best-effort
// — kalau salah satu sukses, OTP tetap accessible. Kalau dua-duanya gagal,
// throw OtpDeliveryFailedError supaya endpoint return 500 (user tahu
// untuk coba lagi).
export async function sendOtpDual(input: {
  email: string
  phone: string | null
  code: string
  mode: OtpMode
}): Promise<DualSendResult> {
  // Run email + WA paralel. Capture error masing-masing tanpa fail-fast.
  const [emailRes, waRes] = await Promise.all([
    sendEmail(input.email, input.code, input.mode),
    sendWa(input.phone, input.code, input.mode),
  ])

  const result: DualSendResult = {
    emailSent: emailRes.ok,
    waSent: waRes.ok,
    emailError: emailRes.ok ? undefined : emailRes.error,
    waError: waRes.ok ? undefined : waRes.error,
  }

  // Acceptable kalau MIN 1 channel sukses. Kalau phone null & email
  // gagal → tidak ada channel sama sekali → throw. Kalau phone ada tapi
  // dua-duanya gagal → throw.
  const anyDelivered = result.emailSent || result.waSent
  if (!anyDelivered) {
    throw new OtpDeliveryFailedError(
      emailRes.ok ? '' : emailRes.error,
      waRes.ok ? '' : waRes.error,
    )
  }
  return result
}

async function sendEmail(
  email: string,
  code: string,
  mode: OtpMode,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await sendAuthOtpEmail(email, code, mode)
    return { ok: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown email error'
    console.warn(`[auth-otp-sender] Email ke ${email} gagal: ${error}`)
    return { ok: false, error }
  }
}

async function sendWa(
  phone: string | null,
  code: string,
  mode: OtpMode,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!phone) return { ok: false, error: 'Nomor WA tidak tersedia' }
  const sessionId = await findOtpWaSessionId()
  if (!sessionId) {
    const error = 'Sesi WA pengirim tidak aktif'
    console.warn(`[auth-otp-sender] ${error} (target ${phone})`)
    return { ok: false, error }
  }
  const text = buildWaMessage(code, mode)
  // Baileys format: tanpa '+'.
  const phoneForWa = phone.replace(/^\+/, '')
  const send = await waService.sendMessage(sessionId, phoneForWa, text)
  if (!send.success) {
    const error = send.error ?? 'Unknown WA error'
    console.warn(`[auth-otp-sender] WA ke ${phone} gagal: ${error}`)
    return { ok: false, error }
  }
  return { ok: true }
}
