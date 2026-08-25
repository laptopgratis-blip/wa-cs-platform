// Validasi + katalog event webhook keluar. Ditaruh di lib/validations (bukan
// lib/services) supaya komponen client bisa mengimpor katalognya tanpa ikut
// menarik Prisma/crypto ke bundle browser.
import { z } from 'zod'

/** Batas endpoint aktif per user — angka yang sama tampil sebagai "X/5". */
export const MAX_WEBHOOK_ENDPOINTS_PER_USER = 5

/** Ambang kegagalan beruntun sebelum endpoint dinonaktifkan otomatis. */
export const WEBHOOK_AUTO_DISABLE_STREAK = 50

export const WEBHOOK_EVENT_TYPES = [
  'message.received',
  'message.status.updated',
  'contact.created',
] as const

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, { label: string; desc: string }> = {
  'message.received': {
    label: 'Pesan masuk',
    desc: 'Customer mengirim pesan ke nomor WhatsApp kamu.',
  },
  'message.status.updated': {
    label: 'Status pesan berubah',
    desc: 'Pesan keluar berubah status: terkirim, dibaca, atau gagal.',
  },
  'contact.created': {
    label: 'Kontak baru',
    desc: 'Nomor baru pertama kali masuk ke daftar kontak.',
  },
}

// URL dicek bentuknya di sini; pemeriksaan anti-SSRF (resolve DNS, tolak IP
// privat) terjadi di server — lib/services/webhooks/url-guard.ts.
const urlSchema = z
  .string()
  .trim()
  .min(12, 'URL terlalu pendek')
  .max(500, 'URL maksimal 500 karakter')
  .refine((v) => {
    try {
      const u = new URL(v)
      // http hanya lolos di dev dengan flag uji lokal (di browser env ini
      // undefined sehingga tetap https-only) — guard SSRF server tetap lapis
      // penentu di lib/services/webhooks/url-guard.ts.
      return (
        u.protocol === 'https:' ||
        (u.protocol === 'http:' && process.env.WEBHOOK_ALLOW_PRIVATE_URL === '1')
      )
    } catch {
      return false
    }
  }, 'URL harus valid dan memakai https://')

export const webhookEndpointCreateSchema = z.object({
  url: urlSchema,
  description: z.string().trim().max(120, 'Deskripsi maksimal 120 karakter').optional().default(''),
  events: z
    .array(z.enum(WEBHOOK_EVENT_TYPES))
    .min(1, 'Pilih minimal satu event')
    .max(WEBHOOK_EVENT_TYPES.length),
})

export const webhookEndpointUpdateSchema = z.object({
  url: urlSchema.optional(),
  description: z.string().trim().max(120).optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1).max(WEBHOOK_EVENT_TYPES.length).optional(),
  isActive: z.boolean().optional(),
})

export type WebhookEndpointCreateInput = z.infer<typeof webhookEndpointCreateSchema>
export type WebhookEndpointUpdateInput = z.infer<typeof webhookEndpointUpdateSchema>
