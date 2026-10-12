// Opsi "CS WhatsApp" di form produk (PURE — dipakai server page & komponen).
//
// Satu nomor WhatsApp yang di-scan ulang menghasilkan BANYAK baris
// WhatsappSession (baris lama DISCONNECTED). Menampilkan semuanya membuat
// dropdown penuh nomor kembar, jadi opsi dikelompokkan per NOMOR — pola yang
// sama dengan filter Inbox (lib/services/inbox/sender-options.ts).
//
// Tiga keadaan nomor (lihat juga resolveCsSender di orders/order-cs.ts):
// - TERHUBUNG  : ada baris CONNECTED && isActive.
// - OFFLINE    : masih terdaftar (ada baris isActive=true) tapi tidak
//                CONNECTED — token habis (PAUSED), menunggu scan ulang,
//                wa-service baru restart. Nomornya masih milik seller, jadi
//                TETAP bisa dipilih (label "· offline").
// - DIHAPUS    : semua barisnya isActive=false. "Hapus nomor" di /whatsapp
//                adalah soft-delete — baris & phoneNumber tetap ada.
//
// Aturan:
// - Sesi tanpa nomor (belum pernah pair) DIBUANG.
// - Sebuah nomor jadi opsi bila masih terdaftar (terhubung/offline), ATAU
//   sudah dihapus tapi salah satu barisnya sedang dipakai produk (supaya
//   pilihan yang tersimpan tetap terlihat, tidak diam-diam tampil "ikuti
//   nomor utama"). Opsi terhapus ditandai `isRemoved` — UI hanya
//   menampilkannya di produk yang memakainya, tidak menawarkannya ke produk
//   lain.
// - Wakil nomor = baris CONNECTED && aktif terbaru; kalau tidak ada, baris
//   belum-dihapus terbaru; kalau tidak ada juga, baris terpakai terbaru. Id
//   wakil inilah yang disimpan ke Product.csSessionId.
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
  /**
   * Nomor sudah dihapus seller dari akun (tidak ada baris isActive=true).
   * Order produk ber-CS nomor ini jatuh ke nomor utama.
   */
  isRemoved: boolean
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
    const registered = newest(rows.filter((row) => row.isActive))
    const representative =
      online ?? registered ?? newest(rows.filter((row) => inUse.has(row.id)))
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
      isRemoved: registered === null,
    })
  }
  // Terhubung → offline → terhapus; urutan asal dipertahankan di tiap kelompok.
  return [
    ...options.filter((o) => o.isConnected),
    ...options.filter((o) => !o.isConnected && !o.isRemoved),
    ...options.filter((o) => o.isRemoved),
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

/**
 * Opsi yang ditawarkan di dialog SATU produk: semua nomor yang masih terdaftar
 * + nomor terhapus hanya bila produk ini sendiri yang sedang memakainya
 * (nomor yang sudah dilepas seller tidak boleh bisa dipilih produk lain).
 */
export function selectableCsSessionOptions(
  options: readonly CsSessionOption[],
  currentSessionId: string | null | undefined,
): CsSessionOption[] {
  const current = findCsSessionOption(options, currentSessionId)
  return options.filter((o) => !o.isRemoved || o.id === current?.id)
}

export function formatCsNumber(phoneNumber: string): string {
  return `+${phoneNumber}`
}

/** Akhiran keadaan nomor: '' (terhubung) / ' · offline' / ' · sudah dihapus'. */
function stateSuffix(option: CsSessionOption): string {
  if (option.isRemoved) return ' · sudah dihapus'
  return option.isConnected ? '' : ' · offline'
}

/** "Toko Kopi (+62812…) · WhatsApp Web · offline" */
export function csSessionOptionLabel(option: CsSessionOption): string {
  const number = formatCsNumber(option.phoneNumber)
  const who = option.displayName ? `${option.displayName} (${number})` : number
  const via =
    option.provider === 'CLOUD_API' ? 'Meta Cloud API' : 'WhatsApp Web'
  return `${who} · ${via}${stateSuffix(option)}`
}

/** Meta kartu daftar produk: "CS: +62812… · offline". */
export function csSessionMetaLabel(option: CsSessionOption): string {
  return `CS: ${formatCsNumber(option.phoneNumber)}${stateSuffix(option)}`
}
