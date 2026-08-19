// Upload file contoh header media template (IMAGE/VIDEO/DOCUMENT):
//   1. simpan ke storage publik hulao (public/uploads/waba-templates/<userId>/)
//      → URL publik dipakai saat KIRIM (`header.image.link`) dan preview;
//   2. Resumable Upload Meta: POST /{APP_ID}/uploads → POST /{upload_id}
//      (Authorization: OAuth, body biner) → handle `h` untuk
//      `example.header_handle` saat create/edit template.
// Jebakan referensi: memakai media_id dari /{phone}/media untuk contoh
// template → Meta menolak. Harus handle dari Resumable Upload.

import { randomBytes } from 'node:crypto'
import { mkdir, open } from 'node:fs/promises'
import path from 'node:path'

import { getMetaConfig } from './config'
import { getWabaCredentialsBySession } from './credentials'
import { graphRequest, graphUploadBinary } from './graph'

export const TEMPLATE_MEDIA_LIMITS = {
  IMAGE: { maxBytes: 5 * 1024 * 1024, mimes: ['image/jpeg', 'image/png'] },
  VIDEO: { maxBytes: 16 * 1024 * 1024, mimes: ['video/mp4'] },
  DOCUMENT: { maxBytes: 100 * 1024 * 1024, mimes: ['application/pdf'] },
} as const

export type TemplateMediaKind = keyof typeof TEMPLATE_MEDIA_LIMITS

export type UploadHeaderExampleResult =
  | { ok: true; handle: string; publicUrl: string; kind: TemplateMediaKind }
  | { ok: false; error: string }

/** Tentukan jenis header dari MIME; null = tidak didukung. */
export function mediaKindFromMime(mime: string): TemplateMediaKind | null {
  for (const [kind, cfg] of Object.entries(TEMPLATE_MEDIA_LIMITS)) {
    if ((cfg.mimes as readonly string[]).includes(mime)) return kind as TemplateMediaKind
  }
  return null
}

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'video/mp4') return 'mp4'
  return 'pdf'
}

function publicBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '')
}

async function saveToStorage(userId: string, file: Buffer, mime: string): Promise<string> {
  const filename = `${randomBytes(12).toString('hex')}.${extFromMime(mime)}`
  const dir = path.join(process.cwd(), 'public', 'uploads', 'waba-templates', userId)
  await mkdir(dir, { recursive: true })
  // fsync — lihat catatan insiden di app/api/products/upload (file 0 byte).
  const fh = await open(path.join(dir, filename), 'w')
  try {
    await fh.writeFile(file)
    await fh.sync()
  } finally {
    await fh.close()
  }
  return `/uploads/waba-templates/${userId}/${filename}`
}

/**
 * Upload contoh header media → {handle, publicUrl}. Never-throw.
 */
export async function uploadTemplateHeaderExample(input: {
  sessionId: string
  file: Buffer
  mimeType: string
  fileName?: string
}): Promise<UploadHeaderExampleResult> {
  try {
    const kind = mediaKindFromMime(input.mimeType)
    if (!kind) {
      return { ok: false, error: 'Format tidak didukung — gambar JPG/PNG, video MP4, atau dokumen PDF' }
    }
    const limit = TEMPLATE_MEDIA_LIMITS[kind]
    if (input.file.length > limit.maxBytes) {
      return { ok: false, error: `Ukuran maksimal ${Math.round(limit.maxBytes / 1024 / 1024)} MB untuk ${kind}` }
    }

    const credRes = await getWabaCredentialsBySession(input.sessionId)
    if (!credRes.ok) return { ok: false, error: credRes.error }
    const { token, userId } = credRes.creds

    let appId: string
    try {
      appId = getMetaConfig().appId
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }

    // 1) storage hulao (URL publik untuk kirim + preview)
    const relUrl = await saveToStorage(userId, input.file, input.mimeType)
    const base = publicBaseUrl()
    const publicUrl = base ? `${base}${relUrl}` : relUrl

    // 2) Resumable Upload — buat sesi upload
    const safeName = encodeURIComponent((input.fileName ?? `header.${extFromMime(input.mimeType)}`).slice(0, 100))
    const start = await graphRequest<{ id: string }>(
      `/${appId}/uploads?file_length=${input.file.length}&file_type=${encodeURIComponent(input.mimeType)}&file_name=${safeName}`,
      { method: 'POST', token },
    )
    if (!start.ok) {
      return { ok: false, error: `Meta menolak sesi upload: ${start.error.message}` }
    }
    const uploadId = start.data.id // "upload:XXXX"

    // 3) kirim biner
    const done = await graphUploadBinary<{ h: string }>(`/${uploadId}`, { token, body: input.file })
    if (!done.ok) {
      return { ok: false, error: `Upload ke Meta gagal: ${done.error.message}` }
    }
    if (!done.data.h) return { ok: false, error: 'Meta tidak mengembalikan handle file' }

    return { ok: true, handle: done.data.h, publicUrl, kind }
  } catch (err) {
    console.error('[waba/template-media] gagal:', err)
    return { ok: false, error: `Gagal upload media: ${(err as Error).message}` }
  }
}
