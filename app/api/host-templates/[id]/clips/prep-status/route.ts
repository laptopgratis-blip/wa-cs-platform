// GET /api/host-templates/[id]/clips/prep-status — cek apakah host siap
// untuk generate klip:
//   - visionReady: HostTemplate.visionAnalyzedAt != null
//   - baselineVideoReady: ada GenerationJob HOST_VIDEO status=DONE
//                         dengan providerTaskId
//   - baselineVideoStatus: status job baseline saat ini (RUNNING/DONE/FAILED)

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
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
    select: {
      userId: true,
      visionAnalyzedAt: true,
      mode: true,
      sourceImageUrl: true,
      videoLoopUrl: true,
    },
  })
  if (!host) return jsonError('Host tidak ditemukan', 404)
  if (session.user.role !== 'ADMIN' && host.userId !== session.user.id) {
    return jsonError('Tidak punya akses', 403)
  }

  const latestVideoJob = await prisma.generationJob.findFirst({
    where: { hostTemplateId: id, type: 'HOST_VIDEO' },
    orderBy: { createdAt: 'desc' },
    select: {
      status: true,
      providerTaskId: true,
      errorMessage: true,
      finishedAt: true,
      inputPayload: true,
    },
  })
  const baselineDurationSec =
    (latestVideoJob?.inputPayload as { duration?: number } | null)?.duration ?? null

  return jsonOk({
    visionReady: !!host.visionAnalyzedAt,
    baselineVideoReady:
      latestVideoJob?.status === 'DONE' && !!latestVideoJob.providerTaskId,
    baselineVideoStatus: latestVideoJob?.status ?? null,
    baselineError: latestVideoJob?.errorMessage ?? null,
    sourceImageUrl: host.sourceImageUrl,
    baselineVideoUrl: host.videoLoopUrl,
    baselineDurationSec,
  })
}
