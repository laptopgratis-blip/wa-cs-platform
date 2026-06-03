// GET /api/host-templates/[id]/baselines — list semua baseline video aktif
// untuk host ini. Pakai di dropdown "Pilih baseline" saat generate klip.
//
// Output: { baselines: [{ klingVideoId, name, durationSec, isPrimary }] }

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
    select: { userId: true },
  })
  if (!host) return jsonError('Host tidak ditemukan', 404)
  if (session.user.role !== 'ADMIN' && host.userId !== session.user.id) {
    return jsonError('Tidak punya akses', 403)
  }

  // Join: ambil HostScene yg READY + match ke GenerationJob via job.outputUrl=scene.videoUrl.
  // HostScene punya local videoUrl (path /uploads/host-videos/...) untuk preview.
  // GenerationJob punya klingVideoId di inputPayload untuk lipsync source.
  const scenes = await prisma.hostScene.findMany({
    where: { hostTemplateId: id, status: 'READY', isEnabled: true, videoUrl: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      videoUrl: true,
      isPrimary: true,
      videoSeconds: true,
      generationJobId: true,
    },
  })
  const jobIds = scenes.map((s) => s.generationJobId).filter((id): id is string => !!id)
  const jobs = await prisma.generationJob.findMany({
    where: { id: { in: jobIds } },
    select: { id: true, inputPayload: true },
  })
  const jobMap = new Map(jobs.map((j) => [j.id, j.inputPayload as { klingVideoId?: string; duration?: number } | null]))

  const baselines = scenes
    .map((s) => {
      const payload = s.generationJobId ? jobMap.get(s.generationJobId) : null
      const klingVideoId = payload?.klingVideoId
      if (!klingVideoId) return null
      return {
        klingVideoId,
        name: s.name,
        videoUrl: s.videoUrl as string, // local path /uploads/host-videos/...
        durationSec: s.videoSeconds ?? payload.duration ?? 5,
        isPrimary: s.isPrimary,
        sceneId: s.id,
      }
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)

  return jsonOk({ baselines })
}
