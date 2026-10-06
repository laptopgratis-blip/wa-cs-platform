// Estimasi Kredit Pesan (Rp) untuk broadcast Cloud API — pure, tanpa prisma.
//
// Billing Kredit Pesan dinonaktifkan sejak 2026-08-25 (lihat
// lib/billing/message-credit-mode.ts): Meta menagih seller LANGSUNG ke kartu
// di WhatsApp Manager. Saat flag mati, estimasi WAJIB 0 supaya startBroadcast
// tidak menolak broadcast karena saldo Kredit Pesan Rp 0.

export interface BroadcastCreditEstimateInput {
  /** MESSAGE_CREDIT_BILLING_ENABLED */
  billingEnabled: boolean
  /** Sesi milik admin platform — tidak pernah ditagih. */
  isPlatform: boolean
  /** Jumlah penerima yang masih PENDING. */
  pendingCount: number
  /** Tarif per pesan untuk kategori template (Rp). */
  ratePerMessageRp: number
}

export function estimateBroadcastCreditRp(input: BroadcastCreditEstimateInput): number {
  if (!input.billingEnabled || input.isPlatform) return 0
  const count = Number.isFinite(input.pendingCount) ? Math.max(0, input.pendingCount) : 0
  const rate = Number.isFinite(input.ratePerMessageRp) ? Math.max(0, input.ratePerMessageRp) : 0
  return count * rate
}
