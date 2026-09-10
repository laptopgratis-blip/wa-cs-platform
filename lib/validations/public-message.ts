// Validasi body POST /api/v1/messages (teks) & /api/v1/messages/template.
import { z } from 'zod'

import { MAX_IMAGE_BASE64_CHARS } from '@/lib/services/public-api/image-data'

// Nomor: normalisasi (buang non-digit) DI DALAM schema lalu validasi jumlah
// DIGIT — bukan panjang string mentah. Tanpa transform, "++++++++" (8 char)
// lolos lalu jadi string kosong saat dinormalisasi, dan tujuan kosong lolos
// ke wa-service. E.164 tanpa "+": 8–15 digit.
const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Nomor wajib diisi')
  .max(32, 'Nomor terlalu panjang')
  .transform((v) => v.replace(/\D/g, ''))
  .refine(
    (v) => v.length >= 8 && v.length <= 15,
    'Nomor harus 8–15 digit (kode negara + nomor, tanpa +).',
  )

// Batas caption gambar mengikuti Cloud API Meta (1024 char); Baileys ikut
// batas yang sama supaya perilaku endpoint tidak beda per provider.
const IMAGE_CAPTION_MAX = 1024

export const publicSendTextSchema = z
  .object({
    phone_number: phoneSchema,
    // Teks pesan. Saat image_url diisi, content jadi CAPTION gambar (opsional).
    // Wajib-tidaknya dicek di superRefine karena bergantung pada image_url.
    content: z
      .string()
      .trim()
      .max(4096, 'Pesan maksimal 4096 karakter')
      .optional(),
    // Opsional: kirim GAMBAR dari URL publik (https). Validasi bentuk di sini;
    // pemeriksaan SSRF (IP privat/internal, kredensial di URL) dilakukan di
    // sendPublicText via assertSafeWebhookUrl sebelum menyentuh transport.
    image_url: z
      .string()
      .trim()
      .min(1)
      .max(2048, 'image_url terlalu panjang (maks 2048 karakter)')
      .nullish(),
    // Opsional (alternatif image_url): GAMBAR sebagai base64 mentah / data URI
    // ("fire and forget" — tidak ada file yang disimpan platform). Bentuk &
    // ukuran string dicek di sini; decode + magic bytes di sendPublicText
    // (decodeImageBase64) sebelum bytes menyentuh transport.
    image_base64: z
      .string()
      .trim()
      .min(1)
      .max(
        MAX_IMAGE_BASE64_CHARS,
        'image_base64 terlalu besar (maksimal 5 MB sebelum encoding)',
      )
      .nullish(),
    // Opsional: dahulukan sesi tertentu (id sesi WhatsApp milik sendiri).
    // nullish: klien (dan contoh body di Playground) lazim mengirim null
    // eksplisit untuk "biar platform yang pilih" — jangan ditolak validasi.
    session_id: z.string().trim().min(1).max(64).nullish(),
    // Opsional: kunci ke session_id. Default false = session_id cuma preferensi,
    // platform boleh failover ke nomor lain kalau sesi itu gagal. true = kalau
    // sesi itu gagal, request ikut gagal (jangan keluar dari nomor lain).
    strict_session: z
      .boolean()
      .nullish()
      .transform((v) => v ?? false),
  })
  .superRefine((v, ctx) => {
    if (v.image_url && v.image_base64) {
      ctx.addIssue({
        code: 'custom',
        path: ['image_base64'],
        message:
          'Pilih salah satu: image_url ATAU image_base64, bukan keduanya.',
      })
      return
    }
    if (!v.image_url && !v.image_base64) {
      // Teks murni: content wajib — pesan error sama dengan skema lama.
      if (!v.content) {
        ctx.addIssue({
          code: 'custom',
          path: ['content'],
          message: 'Isi pesan wajib',
        })
      }
      return
    }
    // Ada gambar by-URL: URL harus http(s) valid.
    if (v.image_url) {
      let parsedUrl: URL | null = null
      try {
        parsedUrl = new URL(v.image_url)
      } catch {
        parsedUrl = null
      }
      if (
        !parsedUrl ||
        (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:')
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['image_url'],
          message:
            'image_url harus URL http(s) valid ke file gambar yang bisa diakses publik.',
        })
      }
    }
    // Caption berlaku untuk kedua bentuk gambar.
    if ((v.content ?? '').length > IMAGE_CAPTION_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['content'],
        message: `Caption gambar maksimal ${IMAGE_CAPTION_MAX} karakter`,
      })
    }
  })

export const publicSendTemplateSchema = z
  .object({
    phone_number: phoneSchema,
    template_id: z.string().trim().min(1).max(64).optional(),
    template_name: z.string().trim().min(1).max(512).optional(),
    // Nilai {{1}}..{{n}} untuk body template (index 0 = {{1}}).
    params: z.array(z.string().max(1024)).max(20).optional().default([]),
    session_id: z.string().trim().min(1).max(64).nullish(),
    strict_session: z
      .boolean()
      .nullish()
      .transform((v) => v ?? false),
  })
  .refine((v) => Boolean(v.template_id || v.template_name), {
    message: 'template_id atau template_name wajib diisi',
    path: ['template_id'],
  })

export type PublicSendTextInput = z.infer<typeof publicSendTextSchema>
export type PublicSendTemplateInput = z.infer<typeof publicSendTemplateSchema>

/** Normalisasi nomor ke digit saja (mis. "+62 812-345" → "62812345"). */
export function normalizeMsisdn(raw: string): string {
  return raw.replace(/\D/g, '')
}
