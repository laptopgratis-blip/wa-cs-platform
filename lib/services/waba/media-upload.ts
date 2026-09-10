// Upload media ke Meta (POST /{phoneNumberId}/media) → media id untuk pesan
// `image: { id }`. Dipakai jalur image_base64 API publik: bytes hanya lewat
// memori proses + penyimpanan media Meta (retensi ±30 hari) — TIDAK ada file
// yang ditulis ke disk platform ("fire and forget").
//
// Kontrak sama dengan graphRequest: TIDAK PERNAH throw.

import { graphRequest, type GraphResult } from './graph'

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function uploadCloudMedia(input: {
  phoneNumberId: string
  token: string
  buffer: Buffer
  mime: string
}): Promise<GraphResult<{ id: string }>> {
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', input.mime)
  form.append(
    'file',
    new Blob([new Uint8Array(input.buffer)], { type: input.mime }),
    `image.${EXTENSION_BY_MIME[input.mime] ?? 'bin'}`,
  )
  const res = await graphRequest<{ id?: string }>(
    `/${input.phoneNumberId}/media`,
    {
      method: 'POST',
      token: input.token,
      body: form,
      // Upload 5 MB di koneksi lambat bisa melewati 30 dtk default.
      timeoutMs: 60_000,
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
