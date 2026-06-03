// POST /api/host-templates/[id]/analyze-image — trigger vision analyzer manual.
// Owner (atau admin) bisa trigger ulang kalau hasil sebelumnya kurang akurat.
//
// Response: { analysis, rawResponse } — analysis sudah di-persist ke
// HostTemplate.visionAnalysis. rawResponse untuk debug.
//
// Pre-req: HostTemplate.sourceImageUrl harus sudah ada (status >= IMAGE_READY).

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { analyzeHostImage } from '@/lib/services/host-gen/vision-analyzer'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params

  const host = await prisma.hostTemplate.findUnique({
    where: { id },
    select: { id: true, userId: true, sourceImageUrl: true, status: true },
  })
  if (!host) return jsonError('Host template tidak ditemukan', 404)
  // Ownership check: owner atau admin.
  if (session.user.role !== 'ADMIN' && host.userId !== session.user.id) {
    return jsonError('Tidak punya akses ke host ini', 403)
  }
  if (!host.sourceImageUrl) {
    return jsonError('Belum ada source image — generate dulu', 400)
  }

  try {
    const result = await analyzeHostImage(id)
    return jsonOk({
      analysis: result.analysis,
      rawResponse: result.rawResponse.slice(0, 3000),
    })
  } catch (e) {
    return jsonError((e as Error).message, 500)
  }
}
