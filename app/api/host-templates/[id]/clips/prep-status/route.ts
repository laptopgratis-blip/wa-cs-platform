// GET /api/host-templates/[id]/clips/prep-status — cek apakah host siap
// untuk generate klip:
//   - visionReady: HostTemplate.visionAnalyzedAt != null
//   - baselineVideoReady: ada GenerationJob HOST_VIDEO status=DONE
//                         dengan providerTaskId
//   - baselineVideoStatus: status job baseline saat ini (RUNNING/DONE/FAILED)
//     — termasuk baseline yang masih DIKIRIM ke Kling (RUNNING) atau GAGAL
//     dikirim sebelum GenerationJob tercipta (FAILED + baselineError), lihat
//     deriveBaselinePrepStatus. Scene kiriman yang macet disapu di sini (lazy).

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { sweepStalledBaselineSubmits } from '@/lib/services/host-gen/baseline-job'
import {
  BASELINE_SCENE_DESCRIPTION_PREFIX,
  deriveBaselinePrepStatus,
} from '@/lib/services/host-gen/baseline-job-rules'

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

  // Sapuan gagal tidak boleh menggagalkan polling status.
  await sweepStalledBaselineSubmits(id).catch((e: unknown) => {
    console.error(`[prep-status ${id}] sweep baseline gagal:`, e)
  })

  const [latestVideoJob, latestOrphanScene] = await Promise.all([
    prisma.generationJob.findFirst({
      where: { hostTemplateId: id, type: 'HOST_VIDEO' },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        providerTaskId: true,
        errorMessage: true,
        finishedAt: true,
        inputPayload: true,
        createdAt: true,
      },
    }),
    // Baseline yang belum punya GenerationJob: masih dikirim ke Kling, atau
    // gagal dikirim (saldo/akun Kling, antrian) sebelum task tercipta.
    prisma.hostScene.findFirst({
      where: {
        hostTemplateId: id,
        generationJobId: null,
        status: { in: ['GENERATING', 'FAILED'] },
        description: { startsWith: BASELINE_SCENE_DESCRIPTION_PREFIX },
      },
      orderBy: { createdAt: 'desc' },
      select: { status: true, errorMessage: true, createdAt: true },
    }),
  ])
  const baseline = deriveBaselinePrepStatus({
    latestJob: latestVideoJob,
    latestOrphanScene,
  })
  const baselineDurationSec =
    (latestVideoJob?.inputPayload as { duration?: number } | null)?.duration ??
    null

  return jsonOk({
    visionReady: !!host.visionAnalyzedAt,
    baselineVideoReady:
      latestVideoJob?.status === 'DONE' && !!latestVideoJob.providerTaskId,
    baselineVideoStatus: baseline.baselineVideoStatus,
    baselineError: baseline.baselineError,
    sourceImageUrl: host.sourceImageUrl,
    baselineVideoUrl: host.videoLoopUrl,
    baselineDurationSec,
  })
}
