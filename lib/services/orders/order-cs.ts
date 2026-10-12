// CS WhatsApp per produk — aturan keputusan (PURE, tanpa prisma).
//
// Seller memilih nomor WA CS di form produk (Product.csSessionId). Untuk order
// yang berisi produk itu:
//   1. pesan otomatis ke pelanggan dikirim DARI nomor CS produk, dan
//   2. pelanggan diarahkan KE nomor CS produk (tombol WhatsApp di invoice,
//      variabel {wa_admin} follow-up).
//
// Tidak ada kolom CS di UserOrder: CS diturunkan LIVE dari
// UserOrder.items[].productId, jadi mengganti CS produk langsung berlaku untuk
// order yang sudah ada. Pemuat datanya: order-cs-loader.ts.

/** Potongan WhatsappSession yang dibutuhkan untuk memutuskan pengirim. */
export interface CsSessionState {
  id: string
  phoneNumber: string | null
  status: string
  isActive: boolean
  updatedAt?: Date | null
}

/** Hasil resolve CS untuk satu order. */
export interface OrderCs {
  /**
   * Sesi yang didahulukan sebagai pengirim (`preferredSessionId` di
   * listSenderCandidates). null = tidak ada preferensi → perilaku lama.
   */
  preferredSessionId: string | null
  /** Nomor CS (digit saja) yang dilihat pelanggan. null = pakai nomor toko. */
  csNumber: string | null
}

export const NO_ORDER_CS: OrderCs = Object.freeze({
  preferredSessionId: null,
  csNumber: null,
})

// Nomor CS berasal dari sesi WA yang pernah tersambung, jadi sudah format
// internasional — boleh non-62 (seller luar negeri). Batas E.164: maks 15.
const CS_NUMBER_PATTERN = /^\d{10,15}$/
// Nomor konfirmasi toko (UserShippingProfile.waConfirmNumber) — aturan lama,
// sama dengan lib/services/order-notif.ts.
const CONFIRM_NUMBER_PATTERN = /^62\d{8,15}$/

function digitsOf(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : ''
}

/**
 * Sesi layak jadi pengirim: CONNECTED && aktif — syarat yang sama dengan
 * listSenderCandidates (lib/wa-session.ts).
 */
export function isCsSessionOnline(s: CsSessionState): boolean {
  return s.status === 'CONNECTED' && s.isActive
}

/**
 * ID produk di dalam order, urut sesuai urutan item & tanpa duplikat.
 *
 * `items` = snapshot Json (PricingItemSnapshot[]). Order Sales Flow menyimpan
 * `[]`; order lama / data rusak bisa berisi item tanpa `productId` — semuanya
 * dilewati, tidak pernah melempar.
 */
export function extractOrderProductIds(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  const seen = new Set<string>()
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const productId = (item as { productId?: unknown }).productId
    if (typeof productId !== 'string' || productId.trim() === '') continue
    seen.add(productId)
  }
  return [...seen]
}

/**
 * Aturan multi-produk: CS order = CS milik ITEM PERTAMA yang produknya punya
 * CS. Produk tanpa CS / sudah terhapus dilewati. Tidak ada → null.
 */
export function pickOrderCsSessionId(
  productIdsInOrder: readonly string[],
  productCsMap: ReadonlyMap<string, string | null>,
): string | null {
  for (const productId of productIdsInOrder) {
    const csSessionId = productCsMap.get(productId)
    if (csSessionId) return csSessionId
  }
  return null
}

/** Nomor CS yang layak dipakai di wa.me: digit saja, 10-15 digit. */
export function normalizeCsNumber(
  phoneNumber: string | null | undefined,
): string | null {
  const digits = digitsOf(phoneNumber)
  return CS_NUMBER_PATTERN.test(digits) ? digits : null
}

/**
 * Tentukan pengirim & nomor tujuan dari sesi CS produk.
 *
 * Setiap scan ulang Baileys membuat baris WhatsappSession BARU (baris lama
 * jadi DISCONNECTED / isActive=false), jadi id yang tersimpan di produk bisa
 * basi. Bila sesi produk tidak (CONNECTED && aktif), pakai sesi lain MILIK
 * USER YANG SAMA dengan nomor sama yang CONNECTED && aktif (terbaru).
 *
 * `userSessions` WAJIB sudah difilter milik user pemilik order oleh pemanggil,
 * dan memuat semua sesi yang BELUM dihapus (isActive=true, status apa pun) —
 * bukan hanya yang CONNECTED.
 *
 * Mode lunak: tidak ada padanan online → preferredSessionId null (pengirim
 * ikut failover lama). csNumber dibedakan antara dua keadaan:
 * - OFFLINE SEMENTARA (nomor masih terdaftar: ada baris isActive=true untuk
 *   nomor itu, mis. PAUSED karena token habis / menunggu scan ulang) → csNumber
 *   TETAP nomor CS; nomor itu masih dipegang seller dan bisa menerima chat.
 * - DIHAPUS seller ("hapus nomor" = soft-delete: isActive=false, phoneNumber
 *   tetap tersimpan, baris tidak pernah di-DELETE) dan tidak didaftarkan lagi
 *   → csNumber null. Pelanggan tidak boleh diarahkan ke nomor yang sudah
 *   dilepas seller (mis. nomor eks-staf); jatuh ke nomor toko.
 */
export function resolveCsSender(input: {
  csSession: CsSessionState | null
  userSessions: readonly CsSessionState[]
}): OrderCs {
  const { csSession, userSessions } = input
  if (!csSession) return NO_ORDER_CS

  const csNumber = normalizeCsNumber(csSession.phoneNumber)
  if (isCsSessionOnline(csSession)) {
    return { preferredSessionId: csSession.id, csNumber }
  }

  const csDigits = digitsOf(csSession.phoneNumber)
  if (!csDigits) return { preferredSessionId: null, csNumber }

  const sameNumber = userSessions.filter(
    (s) => s.id !== csSession.id && digitsOf(s.phoneNumber) === csDigits,
  )
  const twin = sameNumber
    .filter(isCsSessionOnline)
    .reduce<CsSessionState | null>(
      (best, s) => (best && updatedMs(best) >= updatedMs(s) ? best : s),
      null,
    )
  if (twin) return { preferredSessionId: twin.id, csNumber }

  const stillRegistered =
    csSession.isActive || sameNumber.some((s) => s.isActive)
  return {
    preferredSessionId: null,
    csNumber: stillRegistered ? csNumber : null,
  }
}

function updatedMs(s: CsSessionState): number {
  return s.updatedAt ? s.updatedAt.getTime() : 0
}

/**
 * Nomor WhatsApp yang dituju pelanggan dari invoice (tombol "Kirim via
 * WhatsApp" + GET /api/orders/[id]/wa-link). SATU fungsi untuk gate tombol
 * dan untuk API — kalau dua tempat itu memutuskan sendiri-sendiri, tombol
 * bisa tampil padahal API menolak (400).
 *
 * - Ada nomor CS produk → dipakai, TIDAK bergantung toggle konfirmasi WA toko.
 * - Tidak ada → nomor konfirmasi toko, hanya bila aktif & valid (aturan lama).
 * - Selain itu → null (tombol disembunyikan / API 400).
 */
export function chooseCustomerWaNumber(input: {
  csNumber: string | null | undefined
  waConfirmActive?: boolean | null
  waConfirmNumber?: string | null
}): { number: string } | null {
  const { csNumber, waConfirmActive, waConfirmNumber } = input
  if (csNumber && CS_NUMBER_PATTERN.test(csNumber)) return { number: csNumber }
  if (
    waConfirmActive &&
    waConfirmNumber &&
    CONFIRM_NUMBER_PATTERN.test(waConfirmNumber)
  ) {
    return { number: waConfirmNumber }
  }
  return null
}
