// Daftar placeholder follow-up — SUMBER TUNGGAL untuk UI (tombol variabel,
// pemilih Template Meta) dan validasi peta {{n}}. PURE & aman di client.
// Harus sinkron dengan resolver di lib/services/followup-variables.ts
// (dikunci followup-placeholders.test.ts: setiap placeholder pasti
// di-resolve). Jangan import followup-variables dari sini (modul server).

/** Placeholder untuk follow-up berbasis order (semua trigger kecuali lead). */
export const ORDER_PLACEHOLDERS: readonly string[] = [
  '{nama}',
  '{invoice}',
  '{total}',
  '{produk}',
  '{rekening}',
  '{wa_admin}',
  '{alamat}',
  '{etd}',
  '{kurir}',
  '{resi}',
  '{nama_toko}',
  '{invoice_url}',
  // Link 1-klik testimoni & konfirmasi diterima:
  '{link_review}',
  '{link_terima}',
  // Link Perpustakaan e-book/course untuk produk digital:
  '{perpustakaan_url}',
]

/** Placeholder untuk trigger DAYS_AFTER_LIVE_LEAD (lead Live belum order). */
export const LEAD_PLACEHOLDERS: readonly string[] = [
  '{nama}',
  '{produk_minat}',
  '{nama_toko}',
  '{link_order}',
]

export const LEAD_TRIGGER = 'DAYS_AFTER_LIVE_LEAD'

/** Gabungan unik (urutan: order lalu khusus lead). */
export const ALL_FOLLOWUP_PLACEHOLDERS: readonly string[] = [
  ...ORDER_PLACEHOLDERS,
  ...LEAD_PLACEHOLDERS.filter((p) => !ORDER_PLACEHOLDERS.includes(p)),
]

export function allowedPlaceholdersForTrigger(trigger: string): readonly string[] {
  return trigger === LEAD_TRIGGER ? LEAD_PLACEHOLDERS : ORDER_PLACEHOLDERS
}

// Nilai contoh untuk preview di modal — sinkron dengan DUMMY_RESOLVE_CONTEXT
// (lib/services/followup-variables.ts). Isi {rekening} = format pesan WA asli.
export const FOLLOWUP_DUMMY_PREVIEW: Readonly<Record<string, string>> = {
  '{nama}': 'Andi Pratama (TEST)',
  '{invoice}': 'INV-TEST-001',
  '{total}': 'Rp 150.000',
  '{produk}': '- Produk Test × 2 (Rp 150.000)',
  '{rekening}': '🏦 BCA\n1234567890\na.n. TOKO TEST',
  '{wa_admin}': '628111222333',
  '{alamat}': 'Jl. Mawar No. 5 RT 02 RW 01, Bandung, Jawa Barat, 40123',
  '{etd}': '2-3',
  '{kurir}': 'JNE',
  '{resi}': '0987654321',
  '{nama_toko}': 'Toko Test',
  '{invoice_url}': 'https://hulao.id/invoice/INV-TEST-001',
  '{produk_minat}': 'Cleanoz 1 Box',
  '{link_order}': 'https://hulao.id/order/toko-test',
  '{link_review}': 'https://hulao.id/review/ord_test?t=…',
  '{link_terima}': 'https://hulao.id/diterima/ord_test?t=…',
  '{perpustakaan_url}': 'https://hulao.id/belajar',
}

/** Ganti semua placeholder dengan nilai contoh (preview). */
export function previewFollowUpText(text: string): string {
  return Object.entries(FOLLOWUP_DUMMY_PREVIEW).reduce(
    (out, [key, val]) => out.split(key).join(val),
    text,
  )
}
