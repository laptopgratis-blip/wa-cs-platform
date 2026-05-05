// GET    /api/knowledge/[id]  — detail
// PATCH  /api/knowledge/[id]  — update sebagian field (termasuk toggle isActive)
// DELETE /api/knowledge/[id]  — hapus
//
// File yang diupload di /public/uploads/knowledge/<userId>/* TIDAK auto-hapus
// saat entry di-DELETE — disengaja sederhana untuk MVP. Cleanup bisa dijadwalkan
// nanti via cron yang bandingkan filesystem vs DB.
import { unlink } from 'fs/promises'
import path from 'path'

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { knowledgeUpdateSchema } from '@/lib/validations/knowledge'

interface Params {
  params: Promise<{ id: string }>
}

async function ownedKnowledge(userId: string, id: string) {
  return prisma.userKnowledge.findFirst({
    where: { id, userId },
  })
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const item = await ownedKnowledge(session.user.id, id)
  if (!item) return jsonError('Pengetahuan tidak ditemukan', 404)
  return jsonOk({
    ...item,
    lastTriggeredAt: item.lastTriggeredAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  })
}

export async function PATCH(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const existing = await ownedKnowledge(session.user.id, id)
  if (!existing) return jsonError('Pengetahuan tidak ditemukan', 404)

  const json = await req.json().catch(() => null)
  const parsed = knowledgeUpdateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    const data = parsed.data
    const updated = await prisma.userKnowledge.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.textContent !== undefined ? { textContent: data.textContent } : {}),
        ...(data.fileUrl !== undefined ? { fileUrl: data.fileUrl } : {}),
        ...(data.linkUrl !== undefined ? { linkUrl: data.linkUrl } : {}),
        ...(data.caption !== undefined ? { caption: data.caption } : {}),
        ...(data.triggerKeywords !== undefined
          ? { triggerKeywords: data.triggerKeywords }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.order !== undefined ? { order: data.order } : {}),
      },
    })
    return jsonOk({
      ...updated,
      lastTriggeredAt: updated.lastTriggeredAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('[PATCH /api/knowledge/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const existing = await ownedKnowledge(session.user.id, id)
  if (!existing) return jsonError('Pengetahuan tidak ditemukan', 404)

  try {
    await prisma.userKnowledge.delete({ where: { id } })

    // Best-effort cleanup file kalau punya fileUrl. Kalau gagal (file sudah
    // hilang / permission), jangan rollback — entry sudah dihapus dari DB.
    if (existing.fileUrl && existing.fileUrl.startsWith('/uploads/knowledge/')) {
      const rel = existing.fileUrl.replace(/^\//, '')
      const abs = path.join(process.cwd(), 'public', rel)
      await unlink(abs).catch(() => {})
    }

    return jsonOk({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/knowledge/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
