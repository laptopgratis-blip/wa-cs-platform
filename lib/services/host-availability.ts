// Kelayakan HostTemplate untuk dipakai Live Room — satu sumber kebenaran,
// mirror kebutuhan runtime viewer (app/live/[slug]/page.tsx):
//   - TTS_GENERATIVE  : status READY + videoLoopUrl (loop di-generate Kling).
//   - NATIVE_LIBRARY  : status berhenti di IMAGE_READY (flow klip tidak pernah
//     set READY), jadi syaratnya = minimal 1 klip READY (idle dipilih
//     findIdleClips; fallback klip apa pun / videoLoopUrl baseline).
// Dipakai: GET /api/host-templates (list picker), POST /api/live-rooms,
// PATCH /api/live-rooms/[id].
import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

// Fragment where untuk list "host siap dipakai".
export const HOST_USABLE_WHERE: Prisma.HostTemplateWhereInput = {
  OR: [
    { mode: 'TTS_GENERATIVE', status: 'READY', videoLoopUrl: { not: null } },
    {
      mode: 'NATIVE_LIBRARY',
      OR: [
        { videoLoopUrl: { not: null } },
        {
          clips: {
            some: {
              isActive: true,
              status: 'READY',
              videoUrl: { not: null },
            },
          },
        },
      ],
    },
  ],
}

type UsableResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

// Validasi host untuk create/edit Live Room (ownership + kesiapan per mode).
export async function checkHostUsable(
  hostId: string,
  userId: string,
): Promise<UsableResult> {
  const host = await prisma.hostTemplate.findUnique({
    where: { id: hostId },
    select: {
      id: true,
      userId: true,
      isPublic: true,
      mode: true,
      status: true,
      videoLoopUrl: true,
    },
  })
  if (!host) {
    return { ok: false, status: 404, error: 'Host template tidak ditemukan' }
  }
  if (host.userId !== userId && !host.isPublic) {
    return {
      ok: false,
      status: 403,
      error: 'Host template tidak boleh dipakai (private milik user lain)',
    }
  }

  if (host.mode === 'NATIVE_LIBRARY') {
    if (host.videoLoopUrl) return { ok: true }
    const readyClips = await prisma.liveClip.count({
      where: {
        hostTemplateId: host.id,
        isActive: true,
        status: 'READY',
        videoUrl: { not: null },
      },
    })
    if (readyClips === 0) {
      return {
        ok: false,
        status: 400,
        error:
          'Host Klip Live belum punya klip yang siap — generate minimal 1 klip dulu',
      }
    }
    return { ok: true }
  }

  if (host.status !== 'READY' || !host.videoLoopUrl) {
    return {
      ok: false,
      status: 400,
      error: 'Host belum siap (video belum di-generate)',
    }
  }
  return { ok: true }
}
