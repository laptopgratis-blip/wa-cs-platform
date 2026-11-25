// Opsi "Kirim dari" di modal Template Follow-Up (PURE — dipakai server page
// & komponen klien; JANGAN impor prisma di sini).
//
// Membungkus opsi CS WhatsApp produk (products/cs-session-options.ts: satu
// opsi per NOMOR, id wakil = baris CONNECTED terbaru, id basi jadi alias)
// dengan wabaId — modal butuh WABA nomor Cloud API untuk membatasi pilihan
// Template Meta ke WABA nomor pengirim.

import {
  type CsSessionOption,
  type CsSessionRow,
  buildCsSessionOptions,
  csSessionOptionLabel,
} from '@/lib/services/products/cs-session-options'

export type FollowUpSenderRow = CsSessionRow & { wabaId: string | null }
export type FollowUpSenderOption = CsSessionOption & { wabaId: string | null }

/**
 * Ringkas sesi WA seller jadi opsi unik per nomor + wabaId baris wakil.
 * `inUseSessionIds` = FollowUpTemplate.senderSessionId yang sedang dipakai
 * (nomor terhapus tetap tampil di template yang memakainya).
 */
export function buildFollowUpSenderOptions(
  rows: readonly FollowUpSenderRow[],
  inUseSessionIds: Iterable<string>,
): FollowUpSenderOption[] {
  const wabaById = new Map(rows.map((r) => [r.id, r.wabaId]))
  return buildCsSessionOptions(rows, inUseSessionIds).map((option) => ({
    ...option,
    wabaId: wabaById.get(option.id) ?? null,
  }))
}

/** WABA yang Template Meta-nya boleh dipakai nomor ini; null = bukan Cloud API. */
export function senderTemplateWabaId(
  option: FollowUpSenderOption | null | undefined,
): string | null {
  return option?.provider === 'CLOUD_API' ? option.wabaId : null
}

/**
 * Template Meta yang ditawarkan di modal follow-up:
 * - tanpa "Kirim dari" (atau nomor WhatsApp Web) → template di WABA yang
 *   punya sesi Cloud API CONNECTED (perilaku lama);
 * - nomor Cloud API dikunci → template di WABA nomor itu, WALAU nomornya
 *   sedang offline (seller tetap bisa menyiapkan tautan sebelum tersambung).
 * Tautan saat ini selalu tetap tampil supaya pilihannya terlihat.
 */
export function metaTemplatesForSender<T extends { id: string; wabaId: string }>(
  templates: readonly T[],
  input: {
    connectedWabaIds: readonly string[]
    senderWabaId: string | null
    currentId: string | null
  },
): T[] {
  const allowed = (wabaId: string) =>
    input.senderWabaId
      ? wabaId === input.senderWabaId
      : input.connectedWabaIds.includes(wabaId)
  return templates.filter((t) => t.id === input.currentId || allowed(t.wabaId))
}

/** Meta kartu template: "Dikirim dari: Nama (+62…) · offline". */
export function followUpSenderSummary(option: FollowUpSenderOption): string {
  // Label opsi = "Nama (+62…) · Meta Cloud API · offline" → buang kanalnya.
  const label = csSessionOptionLabel(option).replace(
    / · (Meta Cloud API|WhatsApp Web)/,
    '',
  )
  return `Dikirim dari: ${label}`
}

/**
 * Template Meta yang ditautkan harus bisa dikirim DARI nomor yang dikunci:
 * nomor Cloud API hanya bisa memakai template di WABA-nya sendiri. Nomor
 * WhatsApp Web (Baileys) tidak memakai Template Meta → tidak pernah konflik.
 * null = tidak konflik.
 */
export function senderLinkConflict(
  sender: { provider: string; wabaId: string | null } | null,
  templateWabaId: string | null,
): string | null {
  if (!sender || !templateWabaId) return null
  if (sender.provider !== 'CLOUD_API') return null
  if (sender.wabaId && sender.wabaId === templateWabaId) return null
  return (
    'Template Meta yang dipilih milik WABA lain — nomor pengirim hanya bisa ' +
    'memakai template dari WABA-nya sendiri. Pilih ulang Template Meta.'
  )
}
