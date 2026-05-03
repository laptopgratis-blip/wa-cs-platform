// GET  /api/broadcast — list semua broadcast user
// POST /api/broadcast — buat broadcast baru (status DRAFT atau SCHEDULED)
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { buildTargetWhere } from '@/lib/broadcast'
import { prisma } from '@/lib/prisma'
import { broadcastCreateSchema } from '@/lib/validations/broadcast'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const rows = await prisma.broadcast.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        message: true,
        targetTags: true,
        targetStages: true,
        status: true,
        scheduledAt: true,
        startedAt: true,
        completedAt: true,
        totalTargets: true,
        totalSent: true,
        totalFailed: true,
        createdAt: true,
        waSession: { select: { id: true, displayName: true, phoneNumber: true } },
      },
    })
    return jsonOk(
      rows.map((b) => ({
        ...b,
        scheduledAt: b.scheduledAt?.toISOString() ?? null,
        startedAt: b.startedAt?.toISOString() ?? null,
        completedAt: b.completedAt?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
      })),
    )
  } catch (err) {
    console.error('[GET /api/broadcast] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const parsed = broadcastCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  const data = parsed.data

  try {
    // Pastikan WA session milik user.
    const wa = await prisma.whatsappSession.findFirst({
      where: { id: data.waSessionId, userId: session.user.id, isActive: true },
      select: { id: true },
    })
    if (!wa) return jsonError('WhatsApp session tidak ditemukan', 404)

    // Hitung jumlah target.
    const totalTargets = await prisma.contact.count({
      where: buildTargetWhere({
        userId: session.user.id,
        waSessionId: data.waSessionId,
        tags: data.targetTags,
        stages: data.targetStages,
      }) as never,
    })

    const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null
    const status = scheduledAt && scheduledAt.getTime() > Date.now() ? 'SCHEDULED' : 'DRAFT'

    const broadcast = await prisma.broadcast.create({
      data: {
        userId: session.user.id,
        waSessionId: data.waSessionId,
        name: data.name,
        message: data.message,
        targetTags: data.targetTags,
        targetStages: data.targetStages,
        status,
        scheduledAt,
        totalTargets,
      },
      select: { id: true, status: true, totalTargets: true },
    })

    return jsonOk(broadcast, 201)
  } catch (err) {
    console.error('[POST /api/broadcast] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
