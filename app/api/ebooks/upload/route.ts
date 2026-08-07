// POST /api/ebooks/upload — multipart/form-data dengan field "file".
// Pipeline: validasi size → sniff MAGIC BYTES (PDF/EPUB, jangan percaya
// MIME client) → sha256 → tulis DURABLE (fsync) ke storage privat
// EBOOK_STORAGE_DIR/<userId>/<hex24>.<ext> → return metadata file.
//
// Dua langkah dgn create Ebook (upload dulu, lalu POST /api/ebooks dengan
// metadata) — file yatim ditangani saat ganti file/hapus e-book.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import {
  buildEbookRelPath,
  sha256Hex,
  sniffEbookFormat,
  writeEbookFileDurable,
} from '@/lib/ebook-storage'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { EBOOK_MAX_BYTES } from '@/lib/validations/ebook'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }

  const form = await req.formData().catch(() => null)
  if (!form) return jsonError('Form invalid', 400)

  const file = form.get('file')
  if (!(file instanceof File)) return jsonError('File tidak ditemukan', 400)

  if (file.size > EBOOK_MAX_BYTES) {
    return jsonError(
      `Ukuran maksimal ${EBOOK_MAX_BYTES / 1024 / 1024} MB`,
      400,
    )
  }

  try {
    // Buffer penuh di RAM konsisten pola upload eksisting — aman utk 50MB,
    // hindari menaikkan limit tanpa pindah ke streaming upload.
    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length === 0) return jsonError('File kosong', 400)

    const format = sniffEbookFormat(buf)
    if (!format) {
      return jsonError(
        'File harus PDF atau EPUB valid (isi file tidak cocok dengan format)',
        400,
      )
    }

    const relPath = buildEbookRelPath(session.user.id, format)
    await writeEbookFileDurable(relPath, buf)

    return jsonOk({
      filePath: relPath,
      fileName: file.name || `ebook.${format}`,
      fileFormat: format.toUpperCase() as 'PDF' | 'EPUB',
      fileSizeBytes: buf.length,
      fileSha256: sha256Hex(buf),
    })
  } catch (err) {
    console.error('[POST /api/ebooks/upload] gagal:', err)
    return jsonError('Gagal menyimpan file e-book', 500)
  }
}
