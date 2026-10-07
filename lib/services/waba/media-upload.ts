// Upload media ke Meta (POST /{phoneNumberId}/media) → media id untuk pesan
// `image: { id }`. Dipakai jalur image_base64 API publik: bytes hanya lewat
// memori proses + penyimpanan media Meta (retensi ±30 hari) — TIDAK ada file
// yang ditulis ke disk platform ("fire and forget"). Dipakai juga untuk header
// media template (gambar/video/dokumen) yang URL contohnya di CDN Meta.
//
// Kontrak sama dengan graphRequest: TIDAK PERNAH throw.

import { graphRequest, type GraphResult } from './graph'

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
}

const BASENAME_BY_MIME: Record<string, string> = {
  'video/mp4': 'video',
  'application/pdf': 'document',
}

const LARGE_UPLOAD_BYTES = 5 * 1024 * 1024

/**
 * Nama file multipart: `<nama>.<ext sesuai MIME>`. Nama eksplisit dibersihkan
 * (tanpa path & karakter kontrol); default `image.*` (perilaku lama jalur
 * image_base64), `video.mp4`, `document.pdf`.
 */
export function mediaUploadFileName(mime: string, filename?: string): string {
  const ext = EXTENSION_BY_MIME[mime] ?? 'bin'
  const base = (filename ?? '')
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\u0000-\u001f"]/g, '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .trim()
    .slice(0, 100)
  return `${base || BASENAME_BY_MIME[mime] || 'image'}.${ext}`
}

export async function uploadCloudMedia(input: {
  phoneNumberId: string
  token: string
  buffer: Buffer
  mime: string
  filename?: string
}): Promise<GraphResult<{ id: string }>> {
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', input.mime)
  form.append(
    'file',
    new Blob([new Uint8Array(input.buffer)], { type: input.mime }),
    mediaUploadFileName(input.mime, input.filename),
  )
  const res = await graphRequest<{ id?: string }>(
    `/${input.phoneNumberId}/media`,
    {
      method: 'POST',
      token: input.token,
      body: form,
      // Upload 5 MB di koneksi lambat bisa melewati 30 dtk default; video/
      // dokumen header template (s.d. 16-25 MB) diberi waktu lebih.
      timeoutMs: input.buffer.length > LARGE_UPLOAD_BYTES ? 120_000 : 60_000,
    },
  )
  if (!res.ok) return res
  if (!res.data.id) {
    return {
      ok: false,
      error: { message: 'Meta tidak mengembalikan media id' },
    }
  }
  return { ok: true, data: { id: res.data.id } }
}
