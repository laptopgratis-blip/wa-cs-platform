// POST /api/whatsapp/templates/media — multipart {sessionId, file} → upload
// contoh header media ke storage hulao + Resumable Upload Meta → {handle, publicUrl}.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { uploadTemplateHeaderExample, TEMPLATE_MEDIA_LIMITS } from '@/lib/services/waba/template-media'

const MAX_BYTES = TEMPLATE_MEDIA_LIMITS.DOCUMENT.maxBytes

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const form = await req.formData().catch(() => null)
    if (!form) return jsonError('Form tidak valid', 400)
    const sessionId = String(form.get('sessionId') ?? '')
    const file = form.get('file')
    if (!sessionId) return jsonError('sessionId wajib diisi', 400)
    if (!(file instanceof File)) return jsonError('File tidak ditemukan', 400)
    if (file.size > MAX_BYTES) return jsonError('File terlalu besar', 400)

    const owned = await prisma.whatsappSession.findFirst({
      where: { id: sessionId, userId: session.user.id, provider: 'CLOUD_API' },
      select: { id: true },
    })
    if (!owned) return jsonError('Sesi Cloud API tidak ditemukan', 404)

    const buf = Buffer.from(await file.arrayBuffer())
    const r = await uploadTemplateHeaderExample({
      sessionId,
      file: buf,
      mimeType: file.type,
      fileName: file.name,
    })
    if (!r.ok) return jsonError(r.error, 400)
    return jsonOk({ handle: r.handle, publicUrl: r.publicUrl, kind: r.kind })
  } catch (err) {
    console.error('[POST /api/whatsapp/templates/media] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
