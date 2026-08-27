// Helper untuk SiteSettings — key-value store fleksibel.
// Key di-define sebagai konstanta supaya ada single source of truth & autocomplete.
import { prisma } from '@/lib/prisma'

export const SETTING_KEYS = {
  WA_ADMIN: 'WA_ADMIN',
  PLATFORM_NAME: 'PLATFORM_NAME',
  SUPPORT_EMAIL: 'SUPPORT_EMAIL',
  // ID WhatsappSession yang dipakai kirim OTP auth (login/signup).
  // Kosong = fallback ke admin's CONNECTED session. Diset via UI picker
  // di /admin/settings, override env OTP_WA_SESSION_ID.
  OTP_WA_SESSION_ID: 'OTP_WA_SESSION_ID',
  // Channel pengiriman OTP auth: EMAIL (email saja, WA tidak dipakai),
  // WA (WhatsApp saja, email fallback darurat kalau WA gagal),
  // BOTH (dual-send, perilaku lama). Diset via /admin/settings.
  OTP_CHANNEL_MODE: 'OTP_CHANNEL_MODE',
  // URL situs dokumentasi eksternal (mis. https://docs.hulao.id). Kosong =
  // halaman /dokumentasi hanya menampilkan sumber internal — menu tetap
  // berguna, tidak terasa rusak.
  DOCS_URL: 'DOCS_URL',
  // Jam operasional support (teks bebas) — tampil di /bantuan supaya user
  // tahu kapan admin membalas.
  SUPPORT_HOURS: 'SUPPORT_HOURS',
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

export type OtpChannelMode = 'EMAIL' | 'WA' | 'BOTH'

// Default platform name kalau belum di-set di DB.
const DEFAULTS: Record<SettingKey, string> = {
  WA_ADMIN: '',
  PLATFORM_NAME: 'Hulao',
  SUPPORT_EMAIL: '',
  OTP_WA_SESSION_ID: '',
  OTP_CHANNEL_MODE: 'BOTH',
  DOCS_URL: '',
  SUPPORT_HOURS: 'Senin–Jumat, 09.00–17.00 WIB',
}

export async function getOtpChannelMode(): Promise<OtpChannelMode> {
  const v = (await getSetting('OTP_CHANNEL_MODE')).trim().toUpperCase()
  return v === 'EMAIL' || v === 'WA' ? v : 'BOTH'
}

export async function getSetting(key: SettingKey): Promise<string> {
  const row = await prisma.siteSettings.findUnique({ where: { key } })
  return row?.value ?? DEFAULTS[key]
}

export async function getAllSettings(): Promise<Record<SettingKey, string>> {
  const rows = await prisma.siteSettings.findMany()
  const result: Record<string, string> = { ...DEFAULTS }
  for (const r of rows) {
    if (r.key in DEFAULTS) result[r.key] = r.value
  }
  return result as Record<SettingKey, string>
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await prisma.siteSettings.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}
