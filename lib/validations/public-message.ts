// Validasi body POST /api/v1/messages (teks) & /api/v1/messages/template.
import { z } from 'zod'

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

export const publicSendTextSchema = z.object({
  phone_number: phoneSchema,
  content: z
    .string()
    .trim()
    .min(1, 'Isi pesan wajib')
    .max(4096, 'Pesan maksimal 4096 karakter'),
  // Opsional: paksa kirim dari sesi tertentu (id sesi WhatsApp milik sendiri).
  session_id: z.string().trim().min(1).max(64).optional(),
})

export const publicSendTemplateSchema = z
  .object({
    phone_number: phoneSchema,
    template_id: z.string().trim().min(1).max(64).optional(),
    template_name: z.string().trim().min(1).max(512).optional(),
    // Nilai {{1}}..{{n}} untuk body template (index 0 = {{1}}).
    params: z.array(z.string().max(1024)).max(20).optional().default([]),
    session_id: z.string().trim().min(1).max(64).optional(),
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
