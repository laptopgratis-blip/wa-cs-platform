// Decode & validasi gambar base64 dari API publik (image_base64) — murni,
// tanpa I/O, supaya gampang di-test. Dipakai sendPublicText SEBELUM bytes
// menyentuh transport (buffer langsung ke Baileys / upload media API Meta).
// "Fire and forget": tidak ada file yang pernah ditulis ke disk platform.
//
// Batas 5 MB mengikuti batas gambar media Meta (selaras template-media.ts) —
// satu angka untuk semua jalur supaya perilaku endpoint tidak beda provider.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
// String base64 = 4/3 ukuran asli (+ padding & prefix data URI). Tolak cepat
// string yang jelas kebesaran SEBELUM Buffer.from mengalokasikan memori.
export const MAX_IMAGE_BASE64_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 128

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

export interface DecodedImage {
  buffer: Buffer
  mime: ImageMime
}

export type DecodeImageResult =
  | { ok: true; image: DecodedImage }
  | { ok: false; error: string }

const DATA_URI_PREFIX = /^data:image\/[a-z0-9.+-]+;base64,/i

export function decodeImageBase64(raw: string): DecodeImageResult {
  const stripped = raw.replace(DATA_URI_PREFIX, '').replace(/\s+/g, '')
  if (stripped.length === 0) {
    return { ok: false, error: 'image_base64 kosong.' }
  }
  if (stripped.length > MAX_IMAGE_BASE64_CHARS) {
    return {
      ok: false,
      error: 'Gambar terlalu besar — maksimal 5 MB (ukuran sebelum encoding).',
    }
  }
  // Buffer.from(.., 'base64') diam-diam MENGABAIKAN karakter tak valid —
  // tanpa cek ini, payload sampah "terdecode" jadi gambar korup. len%4===1
  // tidak mungkin terjadi pada base64 valid (dengan atau tanpa padding).
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(stripped) || stripped.length % 4 === 1) {
    return { ok: false, error: 'image_base64 bukan base64 valid.' }
  }
  const buffer = Buffer.from(stripped, 'base64')
  if (buffer.byteLength === 0) {
    return { ok: false, error: 'image_base64 bukan base64 valid.' }
  }
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Gambar terlalu besar — maksimal 5 MB.' }
  }
  const mime = sniffImageMime(buffer)
  if (!mime) {
    return {
      ok: false,
      error: 'Format gambar tidak dikenali — dukungan: JPEG, PNG, WebP.',
    }
  }
  return { ok: true, image: { buffer, mime } }
}

/** Deteksi format dari magic bytes — jangan percaya prefix data URI klien. */
export function sniffImageMime(buffer: Buffer): ImageMime | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png'
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}
