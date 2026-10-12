// Edit data pelanggan pada pesanan (PURE, tanpa Prisma) — dipakai PATCH
// /api/orders/[id] dan dialog detail pesanan. Customer sering salah ketik
// nomor/alamat; seller boleh membetulkan Nama, Nomor HP, Alamat lengkap dan
// Kode Pos. Area (provinsi/kota/kecamatan/kelurahan) TIDAK ikut diedit karena
// terikat ongkir yang sudah dihitung saat order dibuat.
//
// Semua fungsi di sini mengembalikan objek baru dan tidak pernah throw.

export const PHONE_INVALID_ERROR = 'Nomor HP tidak valid'
export const ADDRESS_REQUIRED_ERROR =
  'Alamat lengkap wajib diisi untuk pesanan yang dikirim'
export const ADDRESS_TOO_LONG_ERROR = 'Alamat maksimal 1000 karakter'
export const POSTAL_CODE_ERROR = 'Kode pos harus 5 digit angka'
export const NAME_LENGTH_ERROR = 'Nama pelanggan harus 2-120 karakter'

const NAME_MIN = 2
const NAME_MAX = 120
const ADDRESS_MAX = 1000
const POSTAL_CODE_RE = /^\d{5}$/
// Karakter yang wajar di ketikan nomor HP: digit, '+', spasi, strip, titik,
// kurung. Huruf / '@' ditolak supaya salah ketik tidak "dibersihkan" diam-diam
// jadi nomor lain.
const PHONE_CHARS_RE = /^[\d+\s().-]+$/
// Nomor seluler Indonesia: 62 + 8xx…, total 11-15 digit.
const ID_MOBILE_RE = /^628\d{8,12}$/
// Nomor internasional: 10-15 digit, tidak diawali 0.
const INTL_RE = /^[1-9]\d{9,14}$/

/**
 * Normalisasi nomor HP ke digit '62…' TANPA validasi — perilaku PERSIS
 * `normalizePhone` lama di app/api/orders/submit (diekstrak ke sini supaya
 * submit dan edit memakai aturan yang sama). Jangan ubah tanpa memperbarui
 * uji pengunci di customer-edit.test.ts.
 */
export function toOrderPhoneDigits(input: string): string {
  const digits = input.replace(/[^\d]/g, '')
  if (digits.startsWith('0')) return '62' + digits.slice(1)
  if (digits.startsWith('8')) return '62' + digits
  return digits
}

export type OrderPhoneResult =
  { ok: true; phone: string } | { ok: false; error: string }

const ID_COUNTRY_CODE = '62'

// Digit berawalan kode negara 62 → nomor seluler '628…'. Satu '0' tepat
// setelah '62' dibuang ("+62 0812…" = kode negara ditempel di depan nomor
// lokal). Hasil WAJIB cocok pola seluler: telepon rumah ('6221…') bukan nomor
// WA yang bisa dikirimi follow-up.
function idMobileResult(digits: string): OrderPhoneResult {
  const local = digits.slice(ID_COUNTRY_CODE.length)
  const mobile =
    ID_COUNTRY_CODE + (local.startsWith('0') ? local.slice(1) : local)
  return ID_MOBILE_RE.test(mobile)
    ? { ok: true, phone: mobile }
    : { ok: false, error: PHONE_INVALID_ERROR }
}

/**
 * Normalisasi + validasi nomor HP hasil edit seller.
 *   - Indonesia (08…, 8…, 628…, +628…, +62 08…) → digit '628…' (untuk ketikan
 *     yang valid di submit, hasilnya sama dengan submit).
 *   - Luar negeri WAJIB diawali '+' (10-15 digit) → digit apa adanya; angka
 *     pertama setelah '+' tidak ditafsirkan sebagai awalan lokal 0/8.
 *     '+62…' BUKAN luar negeri: tetap wajib nomor seluler 628….
 *   - Selain itu → error 'Nomor HP tidak valid'.
 *
 * PENTING: tanda '+' adalah satu-satunya pembeda "kode negara" vs "awalan
 * lokal". Hasil fungsi ini (digit tanpa '+') TIDAK boleh diumpankan lagi apa
 * adanya — '8613800138000' akan terbaca nomor lokal dan menjadi '62861…'.
 * Untuk mengirim/menampilkan ulang pakai `toOrderPhoneWire` /
 * `orderPhoneForEdit`.
 */
export function normalizeOrderPhone(raw: string): OrderPhoneResult {
  const trimmed = raw.trim()
  if (!trimmed || !PHONE_CHARS_RE.test(trimmed)) {
    return { ok: false, error: PHONE_INVALID_ERROR }
  }
  const typedDigits = trimmed.replace(/[^\d]/g, '')
  // Kode negara 62 DIKETIK sendiri ("+62…" / "62…") → aturan seluler Indonesia.
  if (typedDigits.startsWith(ID_COUNTRY_CODE))
    return idMobileResult(typedDigits)
  if (trimmed.startsWith('+')) {
    return INTL_RE.test(typedDigits)
      ? { ok: true, phone: typedDigits }
      : { ok: false, error: PHONE_INVALID_ERROR }
  }
  // Awalan lokal (0… / 8…): '62' ditambahkan oleh konversi, jadi TIDAK ada
  // pembuangan '0' lagi — '0081…' (kode akses internasional 00) harus tetap
  // error, bukan diam-diam menjadi '6281…'.
  const digits = toOrderPhoneDigits(trimmed)
  return ID_MOBILE_RE.test(digits)
    ? { ok: true, phone: digits }
    : { ok: false, error: PHONE_INVALID_ERROR }
}

/**
 * Format kawat klien → server untuk nomor yang SUDAH dinormalisasi: '+digit'
 * (E.164). Dengan '+', `normalizeOrderPhone` di server mengembalikan digit
 * yang sama persis — nomor luar negeri berawalan 8 (+81/+82/+84/+86) tidak
 * lagi diberi prefiks 62, dan kode negara lain tidak lagi ditolak.
 */
export function toOrderPhoneWire(normalizedDigits: string): string {
  return '+' + normalizedDigits
}

/**
 * Nomor tersimpan → nilai awal field "Nomor HP" di form edit. Nomor luar
 * negeri (digit 10-15 tanpa awalan 62) ditampilkan ber-'+' supaya seller yang
 * hanya membetulkan satu digit tidak mengubahnya jadi nomor Indonesia. Nilai
 * lain (628…, JID '@lid', nomor lama ber-0, ketikan aneh) apa adanya.
 */
export function orderPhoneForEdit(stored: string): string {
  const isForeign = INTL_RE.test(stored) && !stored.startsWith(ID_COUNTRY_CODE)
  return isForeign ? toOrderPhoneWire(stored) : stored
}

/** Kolom UserOrder yang dibaca untuk menghitung perubahan. */
export interface CustomerEditExisting {
  customerName: string
  customerPhone: string
  customerAddress: string | null
  shippingAddress: string | null
  shippingPostalCode: string | null
  isDigitalOnly: boolean
}

/** Field yang boleh dikirim klien — undefined = tidak disentuh. */
export interface CustomerEditInput {
  customerName?: string
  customerPhone?: string
  customerAddress?: string | null
  shippingPostalCode?: string | null
}

/** Partial untuk `prisma.userOrder.update({ data })`. */
export interface CustomerEditData {
  customerName?: string
  customerPhone?: string
  customerAddress?: string | null
  shippingAddress?: string | null
  shippingPostalCode?: string | null
}

export interface CustomerEditChanged {
  name: boolean
  phone: boolean
  address: boolean
  postalCode: boolean
}

export type CustomerEditResult =
  | {
      ok: true
      data: CustomerEditData
      changed: CustomerEditChanged
      anyChanged: boolean
    }
  | { ok: false; error: string }

type FieldResult<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Order punya pengiriman fisik? Order digital-only tanpa alamat kirim tidak —
 * alamatnya opsional dan hanya disimpan di customerAddress.
 */
export function orderHasShipping(
  existing: Pick<CustomerEditExisting, 'isDigitalOnly' | 'shippingAddress'>,
): boolean {
  return !existing.isDigitalOnly || existing.shippingAddress != null
}

function blankToNull(value: string | null): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

function nameEdit(
  existing: CustomerEditExisting,
  input: string | undefined,
): FieldResult<CustomerEditData> {
  if (input === undefined) return { ok: true, data: {} }
  const name = input.trim()
  if (name === existing.customerName) return { ok: true, data: {} }
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { ok: false, error: NAME_LENGTH_ERROR }
  }
  return { ok: true, data: { customerName: name } }
}

function phoneEdit(
  existing: CustomerEditExisting,
  input: string | undefined,
): FieldResult<CustomerEditData> {
  if (input === undefined) return { ok: true, data: {} }
  // Nilai lama dikirim ulang apa adanya (mis. JID LID order Sales Flow, atau
  // nomor lama yang belum ternormalisasi) = tidak diedit → jangan divalidasi,
  // supaya edit field lain tidak terblokir data lama.
  if (input.trim() === existing.customerPhone) return { ok: true, data: {} }
  const normalized = normalizeOrderPhone(input)
  if (!normalized.ok) return normalized
  if (normalized.phone === existing.customerPhone) return { ok: true, data: {} }
  return { ok: true, data: { customerPhone: normalized.phone } }
}

function addressEdit(
  existing: CustomerEditExisting,
  input: string | null | undefined,
): FieldResult<CustomerEditData> {
  if (input === undefined) return { ok: true, data: {} }
  const address = blankToNull(input)
  const hasShipping = orderHasShipping(existing)
  // Order dengan pengiriman: invoice, slip packing, ekspor dan variabel
  // follow-up {alamat} membaca shippingAddress, sementara dialog & kolom tabel
  // membaca customerAddress — keduanya WAJIB sama. Jadi "tidak berubah" hanya
  // bila kedua kolom sudah sama dengan nilai baru (sekaligus menyembuhkan
  // order lama yang dua kolomnya tidak sinkron).
  const unchanged =
    address === existing.customerAddress &&
    (!hasShipping || address === existing.shippingAddress)
  if (unchanged) return { ok: true, data: {} }
  if (address !== null && address.length > ADDRESS_MAX) {
    return { ok: false, error: ADDRESS_TOO_LONG_ERROR }
  }
  if (!hasShipping) return { ok: true, data: { customerAddress: address } }
  if (address === null) return { ok: false, error: ADDRESS_REQUIRED_ERROR }
  return {
    ok: true,
    data: { customerAddress: address, shippingAddress: address },
  }
}

function postalCodeEdit(
  existing: CustomerEditExisting,
  input: string | null | undefined,
): FieldResult<CustomerEditData> {
  if (input === undefined) return { ok: true, data: {} }
  const postalCode = blankToNull(input)
  if (postalCode === existing.shippingPostalCode) return { ok: true, data: {} }
  if (postalCode !== null && !POSTAL_CODE_RE.test(postalCode)) {
    return { ok: false, error: POSTAL_CODE_ERROR }
  }
  return { ok: true, data: { shippingPostalCode: postalCode } }
}

/**
 * Hitung kolom yang BENAR-BENAR berubah dari input edit seller.
 *
 * Catatan: contactId / relasi Contact sengaja TIDAK disentuh saat nomor
 * berubah — riwayat chat tetap menempel ke kontak asal; yang dibetulkan hanya
 * data pengiriman & tujuan follow-up pesanan ini.
 */
export function buildCustomerEditData(
  existing: CustomerEditExisting,
  input: CustomerEditInput,
): CustomerEditResult {
  const name = nameEdit(existing, input.customerName)
  if (!name.ok) return name
  const phone = phoneEdit(existing, input.customerPhone)
  if (!phone.ok) return phone
  const address = addressEdit(existing, input.customerAddress)
  if (!address.ok) return address
  const postalCode = postalCodeEdit(existing, input.shippingPostalCode)
  if (!postalCode.ok) return postalCode

  const changed: CustomerEditChanged = {
    name: 'customerName' in name.data,
    phone: 'customerPhone' in phone.data,
    address: 'customerAddress' in address.data,
    postalCode: 'shippingPostalCode' in postalCode.data,
  }
  return {
    ok: true,
    data: {
      ...name.data,
      ...phone.data,
      ...address.data,
      ...postalCode.data,
    },
    changed,
    anyChanged: Object.values(changed).some(Boolean),
  }
}

/** Nilai form edit pelanggan di dialog detail pesanan (semua string). */
export interface CustomerEditDraft {
  name: string
  phone: string
  address: string
  postalCode: string
}

export function customerDraftFromOrder(
  existing: CustomerEditExisting,
): CustomerEditDraft {
  return {
    name: existing.customerName,
    phone: orderPhoneForEdit(existing.customerPhone),
    address: existing.customerAddress ?? '',
    postalCode: existing.shippingPostalCode ?? '',
  }
}

export type CustomerEditRequest =
  | { ok: true; body: CustomerEditInput; anyChanged: boolean }
  | { ok: false; error: string }

/**
 * Draft form dialog → potongan body PATCH /api/orders/[id]. Hanya field yang
 * benar-benar diubah seller (dibanding nilai awal form) yang divalidasi dan
 * dikirim. Nomor dikirim dalam format kawat '+digit' (`toOrderPhoneWire`) —
 * BUKAN digit polos — karena server menormalisasi ulang dan tanpa '+' nomor
 * luar negeri terbaca sebagai nomor lokal (dikunci uji round-trip).
 * shippingAddress tidak pernah dikirim — server yang menurunkannya dari
 * customerAddress. Kode pos diabaikan untuk order tanpa pengiriman (field-nya
 * disembunyikan di dialog).
 */
export function buildCustomerEditRequest(
  existing: CustomerEditExisting,
  draft: CustomerEditDraft,
): CustomerEditRequest {
  const initial = customerDraftFromOrder(existing)
  const touched = (key: keyof CustomerEditDraft): boolean =>
    draft[key].trim() !== initial[key].trim()
  const input: CustomerEditInput = {
    ...(touched('name') ? { customerName: draft.name } : {}),
    ...(touched('phone') ? { customerPhone: draft.phone } : {}),
    ...(touched('address') ? { customerAddress: draft.address } : {}),
    ...(touched('postalCode') && orderHasShipping(existing)
      ? { shippingPostalCode: draft.postalCode }
      : {}),
  }
  const result = buildCustomerEditData(existing, input)
  if (!result.ok) return result
  const body: CustomerEditInput = {
    ...(result.changed.name ? { customerName: result.data.customerName } : {}),
    ...(result.data.customerPhone !== undefined
      ? { customerPhone: toOrderPhoneWire(result.data.customerPhone) }
      : {}),
    ...(result.changed.address
      ? { customerAddress: result.data.customerAddress }
      : {}),
    ...(result.changed.postalCode
      ? { shippingPostalCode: result.data.shippingPostalCode }
      : {}),
  }
  return { ok: true, body, anyChanged: result.anyChanged }
}

export type QueueRefreshPlan = 'replace' | 'keep'

/**
 * Putuskan nasib pesan antrean follow-up (snapshot resolvedMessage) setelah
 * data pelanggan berubah.
 *   - `oldResolved`     = template di-resolve dengan data order LAMA.
 *   - `currentResolved` = isi antrean saat ini.
 *   - `newResolved`     = template di-resolve dengan data order BARU.
 * 'replace' hanya bila isi antrean masih persis hasil resolve lama (belum
 * disentuh seller). Beda sedikit pun = dianggap editan manual → 'keep',
 * jangan ditimpa.
 */
export function planQueueRefresh(input: {
  oldResolved: string
  currentResolved: string
  newResolved: string
}): QueueRefreshPlan {
  return input.currentResolved === input.oldResolved ? 'replace' : 'keep'
}
