// GET /api/ebook/download/[token] — streaming file e-book by token.
//
// PUBLIC by-token (bearer, TTL 15 menit dari request-download). File dibaca
// dari storage privat (EBOOK_STORAGE_DIR) via createReadStream — TIDAK
// pernah dibuffer penuh (file bisa 50MB; buffer per-request akan menjebol
// RAM saat download paralel). Dukung single Range request supaya download
// manager bisa resume tanpa menghitung jatah dobel (token sekali-hitung,
// lihat lib/services/ebook/download.ts).
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'

import { NextResponse } from 'next/server'

import { ebookAbsPath } from '@/lib/ebook-storage'
import { consumeDownloadToken } from '@/lib/services/ebook/download'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CONTENT_TYPE: Record<string, string> = {
  PDF: 'application/pdf',
  EPUB: 'application/epub+zip',
}

// Encode nama file utk Content-Disposition (RFC 5987) — nama asli bisa
// mengandung spasi/unicode.
function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")
  const encoded = encodeURIComponent(fileName)
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  try {
    const result = await consumeDownloadToken(token, {
      ipAddress:
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: req.headers.get('user-agent'),
    })
    if (!result.ok || !result.file) {
      return NextResponse.json(
        { success: false, error: result.message ?? 'Download ditolak' },
        { status: result.httpStatus ?? 403 },
      )
    }

    const abs = ebookAbsPath(result.file.filePath) // validasi anti-traversal
    let fileSize: number
    try {
      const s = await stat(abs)
      fileSize = s.size
    } catch {
      console.error(
        `[ebook-download] file hilang di disk: ${result.file.filePath}`,
      )
      return NextResponse.json(
        { success: false, error: 'File tidak ditemukan — hubungi penjual' },
        { status: 404 },
      )
    }

    const baseHeaders: Record<string, string> = {
      'Content-Type':
        CONTENT_TYPE[result.file.fileFormat] ?? 'application/octet-stream',
      'Content-Disposition': contentDisposition(result.file.fileName),
      'Accept-Ranges': 'bytes',
      // File berbayar — jangan pernah ke-cache proxy/browser bersama.
      'Cache-Control': 'private, no-store',
    }

    // Single Range support (bytes=start-end / bytes=start- / bytes=-suffix).
    const rangeHeader = req.headers.get('range')
    if (rangeHeader) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
      if (!m || (m[1] === '' && m[2] === '')) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}` },
        })
      }
      let start: number
      let end: number
      if (m[1] === '') {
        // Suffix range: bytes=-N → N byte terakhir.
        const suffix = Number(m[2])
        start = Math.max(0, fileSize - suffix)
        end = fileSize - 1
      } else {
        start = Number(m[1])
        end = m[2] === '' ? fileSize - 1 : Math.min(Number(m[2]), fileSize - 1)
      }
      if (start >= fileSize || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}` },
        })
      }
      const stream = createReadStream(abs, { start, end })
      return new NextResponse(
        Readable.toWeb(stream) as unknown as ReadableStream,
        {
          status: 206,
          headers: {
            ...baseHeaders,
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': String(end - start + 1),
          },
        },
      )
    }

    const stream = createReadStream(abs)
    return new NextResponse(
      Readable.toWeb(stream) as unknown as ReadableStream,
      {
        status: 200,
        headers: { ...baseHeaders, 'Content-Length': String(fileSize) },
      },
    )
  } catch (err) {
    console.error('[GET /api/ebook/download] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 },
    )
  }
}
