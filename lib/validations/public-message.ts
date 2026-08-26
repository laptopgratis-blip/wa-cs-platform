// Validasi body POST /api/v1/messages (teks) & /api/v1/messages/template.
import { z } from 'zod'

// Nomor: 8–20 digit setelah normalisasi (kode negara + nomor). Normalisasi
// (buang non-digit) dilakukan di handler; di sini cukup batas kasar.
const phoneSchema = z
  .string()
  .trim()
  .min(8, 'Nomor terlalu pendek')
  .max(24, 'Nomor terlalu panjang')

export const publicSendTextSchema = z.object({
  phone_number: phoneSchema,
  content: z.string().trim().min(1, 'Isi pesan wajib').max(4096, 'Pesan maksimal 4096 karakter'),
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
