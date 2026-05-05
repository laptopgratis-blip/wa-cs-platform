// POST /api/knowledge/upload — upload file pendukung untuk knowledge entry.
// Pakai multipart/form-data dengan field "file" + "kind" ('IMAGE' | 'FILE').
//
// Output: { url, filename, size, mimeType } — caller (form Knowledge) lalu
// kirim url ini sebagai fileUrl saat POST /api/knowledge.
//
// Validasi:
//   IMAGE → JPG/PNG/WebP/GIF, max 5 MB
//   FILE  → PDF / Word / Excel / TXT, max 10 MB
//
// File disimpan di /public/uploads/knowledge/<userId>/<random>.<ext>.
// Folder ini di-mount sebagai volume di docker-compose (lihat hulao-uploads
// container) supaya tetap persist setelah deploy ulang.
import { randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const FILE_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/csv': 'csv',
}

const IMAGE_MAX = 5 * 1024 * 1024 // 5 MB
const FILE_MAX = 10 * 1024 * 1024 // 10 MB

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return jsonError('Format upload tidak valid (butuh multipart/form-data)')
  }

  const file = form.get('file')
  const kindRaw = form.get('kind')
  const kind = typeof kindRaw === 'string' ? kindRaw.toUpperCase() : ''

  if (!(file instanceof File)) return jsonError('File tidak ditemukan')
  if (kind !== 'IMAGE' && kind !== 'FILE') {
    return jsonError('Parameter kind harus IMAGE atau FILE')
  }

  const allowed = kind === 'IMAGE' ? IMAGE_TYPES : FILE_TYPES
  const maxBytes = kind === 'IMAGE' ? IMAGE_MAX : FILE_MAX

  if (!allowed[file.type]) {
    return jsonError(
      kind === 'IMAGE'
        ? 'Tipe gambar harus JPG, PNG, WebP, atau GIF'
        : 'Tipe file harus PDF, Word, Excel, TXT, atau CSV',
    )
  }
  if (file.size > maxBytes) {
    return jsonError(
      kind === 'IMAGE' ? 'Ukuran gambar maksimal 5 MB' : 'Ukuran file maksimal 10 MB',
    )
  }

  try {
    const ext = allowed[file.type] ?? 'bin'
    const filename = `${randomBytes(10).toString('hex')}.${ext}`
    const dir = path.join(
      process.cwd(),
      'public',
      'uploads',
      'knowledge',
      session.user.id,
    )
    await mkdir(dir, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(dir, filename), buffer)

    const url = `/uploads/knowledge/${session.user.id}/${filename}`

    return jsonOk(
      {
        url,
        filename,
        originalName: file.name,
        size: file.size,
        mimeType: file.type,
      },
      201,
    )
  } catch (err) {
    console.error('[POST /api/knowledge/upload] gagal:', err)
    return jsonError('Gagal menyimpan file', 500)
  }
}
