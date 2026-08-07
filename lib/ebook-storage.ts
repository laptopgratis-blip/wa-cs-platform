// Helper storage PRIVAT file e-book (PDF/EPUB berbayar).
//
// PENTING: file e-book TIDAK BOLEH di public/uploads — path itu diserve
// nginx uploads-server tanpa auth + Cache-Control immutable 1 tahun di
// produksi (docker-compose.yml). Semua akses file hanya lewat route
// /api/ebook/download/[token] yang memverifikasi entitlement.
import { createHash, randomBytes } from 'crypto'
import { open, mkdir, stat, unlink } from 'fs/promises'
import path from 'path'

// Direktori root storage e-book. Di produksi di-mount sebagai volume
// ./storage/ebooks:/app/storage/ebooks (lihat docker-compose.yml).
export function getEbookStorageDir(): string {
  const fromEnv = process.env.EBOOK_STORAGE_DIR
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv)
  }
  return path.join(process.cwd(), 'storage', 'ebooks')
}

// Path relatif file e-book: <userId>/<hex24>.<pdf|epub>. Disimpan di
// Ebook.filePath dan divalidasi ulang sebelum join (anti path-traversal).
const SAFE_REL_PATH_RE = /^[a-zA-Z0-9]+\/[a-f0-9]{24}\.(pdf|epub)$/

export function buildEbookRelPath(userId: string, ext: 'pdf' | 'epub'): string {
  return `${userId}/${randomBytes(12).toString('hex')}.${ext}`
}

// Throw kalau path relatif tidak sesuai format aman. WAJIB dipanggil di
// setiap titik yang menerima filePath dari luar (DB/request) sebelum join
// ke filesystem — mencegah `../../etc/passwd` dkk.
export function assertSafeEbookRelPath(rel: string): void {
  if (!SAFE_REL_PATH_RE.test(rel)) {
    throw new Error(`Path file e-book tidak valid: ${rel}`)
  }
}

export function ebookAbsPath(rel: string): string {
  assertSafeEbookRelPath(rel)
  return path.join(getEbookStorageDir(), rel)
}

// Tulis file dengan fsync — writeFile biasa cuma menulis ke page cache;
// kalau server reboot sebelum flush, file jadi 0 byte padahal row Ebook
// sudah tersimpan (insiden 27 Jul di public/uploads). Untuk file BERBAYAR
// ini fatal (refund), jadi durability wajib.
export async function writeEbookFileDurable(
  rel: string,
  buf: Buffer,
): Promise<void> {
  const abs = ebookAbsPath(rel)
  await mkdir(path.dirname(abs), { recursive: true })
  const fh = await open(abs, 'w')
  try {
    await fh.writeFile(buf)
    await fh.sync()
  } finally {
    await fh.close()
  }
}

// Hapus file best-effort — dipakai saat ganti file / hapus Ebook. Idempotent
// (file sudah hilang bukan error).
export async function deleteEbookFile(rel: string): Promise<void> {
  try {
    assertSafeEbookRelPath(rel)
  } catch {
    return
  }
  await unlink(path.join(getEbookStorageDir(), rel)).catch(() => {})
}

// Cek file benar-benar ada di disk (dipakai validasi create Ebook — jangan
// simpan row yang menunjuk file hantu).
export async function ebookFileExists(rel: string): Promise<boolean> {
  try {
    const s = await stat(ebookAbsPath(rel))
    return s.isFile() && s.size > 0
  } catch {
    return false
  }
}

export function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

// Deteksi format via MAGIC BYTES — jangan percaya file.type dari client
// (bisa dipalsukan; file berbayar wajib diverifikasi server-side).
// - PDF : 5 byte pertama "%PDF-".
// - EPUB: kontainer zip ("PK\x03\x04") DAN spek EPUB mewajibkan entry
//   pertama bernama `mimetype` berisi "application/epub+zip" disimpan
//   TANPA kompresi → string itu muncul di ±byte 30-58 file. Zip tanpa
//   string tsb = bukan EPUB valid → tolak.
export function sniffEbookFormat(buf: Buffer): 'pdf' | 'epub' | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'pdf'
  }
  const isZip =
    buf.length >= 4 &&
    buf[0] === 0x50 && // P
    buf[1] === 0x4b && // K
    buf[2] === 0x03 &&
    buf[3] === 0x04
  if (isZip) {
    const head = buf.subarray(0, 128).toString('latin1')
    if (head.includes('application/epub+zip')) return 'epub'
  }
  return null
}
