// GET /api/admin/host-templates/[id] — detail + status (dipakai polling UI)
// DELETE /api/admin/host-templates/[id] — hapus row (file di filesystem tidak
//   auto-hapus untuk audit; cleanup nanti via cron terpisah).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const tpl = await prisma.hostTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      name: true,
      visualStyle: true,
      promptImage: true,
      promptVideo: true,
      refImageUrls: true,
      sourceImageUrl: true,
      videoLoopUrl: true,
      videoSeconds: true,
      status: true,
      isPublic: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
      jobs: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          provider: true,
          model: true,
          status: true,
          outputUrl: true,
          errorMessage: true,
          apiCostUsd: true,
          tokensCharged: true,
          createdAt: true,
          finishedAt: true,
        },
      },
    },
  })
  if (!tpl) return jsonError('Template tidak ditemukan', 404)
  if (tpl.userId !== session.user.id) {
    return jsonError('Akses ditolak', 403)
  }
  return jsonOk(tpl)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const tpl = await prisma.hostTemplate.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (!tpl) return jsonError('Template tidak ditemukan', 404)
  if (tpl.userId !== session.user.id) {
    return jsonError('Akses ditolak', 403)
  }
  await prisma.hostTemplate.delete({ where: { id } })
  return jsonOk({ deleted: id })
}
