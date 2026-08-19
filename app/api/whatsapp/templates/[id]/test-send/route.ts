// POST /api/whatsapp/templates/[id]/test-send {to, params} — kirim template
// ke satu nomor (uji). Memotong Kredit Pesan NYATA (UI memberi tahu).
import { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { sendCloudTemplate } from '@/lib/services/waba/send-template'
import { templateTestSendSchema } from '@/lib/validations/waba-template'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  try {
    const parsed = templateTestSendSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError(parsed.error.issues.map((i) => i.message).join('; '), 400)

    const tpl = await prisma.wabaTemplate.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, wabaId: true },
    })
    if (!tpl) return jsonError('Template tidak ditemukan', 404)

    const sender = await prisma.whatsappSession.findFirst({
      where: { userId: session.user.id, provider: 'CLOUD_API', wabaId: tpl.wabaId, status: { not: 'DISCONNECTED' }, isActive: true },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      select: { id: true },
    })
    if (!sender) return jsonError('Tidak ada sesi Cloud API aktif untuk WABA template ini', 409)

    const r = await sendCloudTemplate({
      sessionId: sender.id,
      to: parsed.data.to,
      templateId: tpl.id,
      params: parsed.data.params,
      purpose: 'TEST',
      source: 'TEMPLATE',
    })
    if (!r.success) {
      const status = r.code === 'INSUFFICIENT_CREDIT' ? 402 : 400
      return NextResponse.json({ success: false, error: r.error, code: r.code }, { status })
    }
    return jsonOk(r.data)
  } catch (err) {
    console.error('[POST /api/whatsapp/templates/:id/test-send] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
