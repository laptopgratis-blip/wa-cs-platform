// Opsi "CS WhatsApp" di form produk (PURE — dipakai server page & komponen).
//
// Satu nomor WhatsApp yang di-scan ulang menghasilkan BANYAK baris
// WhatsappSession (baris lama DISCONNECTED). Menampilkan semuanya membuat
// dropdown penuh nomor kembar, jadi opsi dikelompokkan per NOMOR — pola yang
// sama dengan filter Inbox (lib/services/inbox/sender-options.ts).
//
// Aturan:
// - Sesi tanpa nomor (belum pernah pair) DIBUANG.
// - Sebuah nomor jadi opsi bila punya baris CONNECTED && aktif, ATAU salah
//   satu barisnya sedang dipakai produk (walau offline — supaya pilihan yang
//   tersimpan tetap terlihat, tidak diam-diam tampil "ikuti nomor utama").
// - Wakil nomor = baris CONNECTED && aktif terbaru; kalau tidak ada, baris
//   terpakai terbaru. Id wakil inilah yang disimpan ke Product.csSessionId.
// - Baris lain senomor jadi `aliasIds`: produk yang masih menunjuk id basi
//   tetap dikenali sebagai nomor yang sama.

export type CsSessionProvider = 'BAILEYS' | 'CLOUD_API'

export interface CsSessionRow {
  id: string
  displayName: string | null
  phoneNumber: string | null
  provider: string
  status: string
  isActive: boolean
  updatedAt?: Date | null
}

export interface CsSessionOption {
  /** Id sesi wakil nomor ini — nilai yang disimpan ke Product.csSessionId. */
  id: string
  /** Id baris sesi lain untuk nomor yang sama (umumnya id basi). */
  aliasIds: string[]
  /** Nomor, digit saja. */
  phoneNumber: string
  displayName: string | null
  provider: CsSessionProvider
  isConnected: boolean
}

function digitsOf(value: string | null): string {
  return value ? value.replace(/\D/g, '') : ''
}

function isOnline(row: CsSessionRow): boolean {
  return row.status === 'CONNECTED' && row.isActive
}

function updatedMs(row: CsSessionRow): number {
  return row.updatedAt ? row.updatedAt.getTime() : 0
}

function newest(rows: readonly CsSessionRow[]): CsSessionRow | null {
  return rows.reduce<CsSessionRow | null>(
    (best, row) => (best && updatedMs(best) >= updatedMs(row) ? best : row),
    null,
  )
}

/**
 * Ringkas sesi WA milik seller jadi opsi unik per nomor.
 * `inUseSessionIds` = Product.csSessionId yang sedang dipakai produk seller.
 */
export function buildCsSessionOptions(
  sessions: readonly CsSessionRow[],
  inUseSessionIds: Iterable<string>,
): CsSessionOption[] {
  const inUse = new Set(inUseSessionIds)
  const byPhone = new Map<string, CsSessionRow[]>()
  for (const row of sessions) {
    const phone = digitsOf(row.phoneNumber)
    if (!phone) continue
    byPhone.set(phone, [...(byPhone.get(phone) ?? []), row])
  }

  const options: CsSessionOption[] = []
  for (const [phone, rows] of byPhone) {
    const online = newest(rows.filter(isOnline))
    const representative =
      online ?? newest(rows.filter((row) => inUse.has(row.id)))
    if (!representative) continue
    options.push({
      id: representative.id,
      aliasIds: rows
        .filter((row) => row.id !== representative.id)
        .map((row) => row.id),
      phoneNumber: phone,
      displayName:
        representative.displayName ??
        rows.find((row) => row.displayName)?.displayName ??
        null,
      provider:
        representative.provider === 'CLOUD_API' ? 'CLOUD_API' : 'BAILEYS',
      isConnected: online !== null,
    })
  }
  // Nomor terhubung dulu; urutan asal dipertahankan di dalam tiap kelompok.
  return [
    ...options.filter((o) => o.isConnected),
    ...options.filter((o) => !o.isConnected),
  ]
}

/** Opsi untuk sebuah csSessionId — cocok ke id wakil maupun id basi. */
export function findCsSessionOption(
  options: readonly CsSessionOption[],
  sessionId: string | null | undefined,
): CsSessionOption | null {
  if (!sessionId) return null
  return (
    options.find((o) => o.id === sessionId || o.aliasIds.includes(sessionId)) ??
    null
  )
}

export function formatCsNumber(phoneNumber: string): string {
  return `+${phoneNumber}`
}

/** "Toko Kopi (+62812…) · WhatsApp Web · offline" */
export function csSessionOptionLabel(option: CsSessionOption): string {
  const number = formatCsNumber(option.phoneNumber)
  const who = option.displayName ? `${option.displayName} (${number})` : number
  const via =
    option.provider === 'CLOUD_API' ? 'Meta Cloud API' : 'WhatsApp Web'
  return `${who} · ${via}${option.isConnected ? '' : ' · offline'}`
}
