// Schema validasi untuk endpoint payment (Tripay & manual transfer).
import { z } from 'zod'

export const manualPaymentCreateSchema = z.object({
  packageId: z.string().min(1, 'Paket wajib dipilih'),
})
export type ManualPaymentCreateInput = z.infer<typeof manualPaymentCreateSchema>

// Catatan: file bukti diupload via multipart/form-data, bukan JSON.
// Schema ini hanya validasi field opsional `note`.
export const manualPaymentProofNoteSchema = z.object({
  note: z.string().trim().max(500).optional(),
})
