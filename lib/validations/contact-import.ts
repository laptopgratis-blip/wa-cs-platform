// Schema validasi impor kontak (CSV / tempel spreadsheet) ke satu nomor WA.
import { z } from 'zod'

/** Batas teks mentah (≈2 MB) — cukup untuk ±10.000 baris nama + nomor. */
export const CONTACT_IMPORT_MAX_CHARS = 2_000_000

export const contactImportSchema = z.object({
  sessionId: z.string().trim().min(1, 'Pilih nomor WhatsApp tujuan'),
  tag: z.string().max(100, 'Tag terlalu panjang').optional(),
  text: z
    .string()
    .min(1, 'Data kontak kosong')
    .max(CONTACT_IMPORT_MAX_CHARS, 'Data terlalu besar — maksimal sekitar 2 MB per impor'),
  dryRun: z.boolean().optional().default(false),
})

export type ContactImportInput = z.infer<typeof contactImportSchema>
