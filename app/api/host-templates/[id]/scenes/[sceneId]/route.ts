// PATCH/DELETE /api/host-templates/[id]/scenes/[sceneId]
//   PATCH:
//     { action: 'set_primary' } → tandai scene sbg primary + sync HostTemplate.videoLoopUrl
//     { action: 'regenerate', durationSeconds? } → resubmit Kling untuk scene ini
//     { name?, description?, promptVideo? } → update field manual
//   DELETE: hapus scene (kalau primary, hapus juga, isPrimary di host akan kosong)
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { InsufficientBalanceError } from '@/lib/services/ai-generation-log'
import { enqueueVideoJob } from '@/lib/services/host-gen/queue'
import { prisma } from '@/lib/prisma'

const patchSchema = z.union([
  z.object({
    action: z.literal('set_primary'),
  }),
  z.object({
    action: z.literal('toggle'),
    isEnabled: z.boolean(),
  }),
  z.object({
    action: z.literal('regenerate'),
    durationSeconds: z.union([z.literal(5), z.literal(10)]).default(5),
    promptVideo: z.string().trim().min(20).max(2000).optional(),
  }),
  z.object({
    action: z.literal('update'),
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(800).nullable().optional(),
    promptVideo: z.string().trim().min(20).max(2000).optional(),
  }),
])

function getPublicBaseUrl(req: Request): string {
  const env = process.env.NEXTAUTH_URL?.trim()
  if (env) return env
  const proto = req.headers.get('x-forwarded-proto') ?? 'http'
  const host = req.headers.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}

async function ensureOwner(
  hostId: string,
  sceneId: string,
  userId: string,
): Promise<
  | { ok: true; scene: NonNullable<Awaited<ReturnType<typeof prisma.hostScene.findUnique>>>; sourceImageUrl: string | null }
  | { ok: false; res: ReturnType<typeof jsonError> }
> {
  const scene = await prisma.hostScene.findUnique({
    where: { id: sceneId },
    include: { hostTemplate: { select: { userId: true, sourceImageUrl: true } } },
  })
  if (!scene) return { ok: false, res: jsonError('Scene tidak ditemukan', 404) }
  if (scene.hostTemplateId !== hostId)
    return { ok: false, res: jsonError('Scene milik host lain', 400) }
  if (scene.userId !== userId)
    return { ok: false, res: jsonError('Akses ditolak', 403) }
  return {
    ok: true,
    scene,
    sourceImageUrl: scene.hostTemplate.sourceImageUrl,
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; sceneId: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id, sceneId } = await params
  const check = await ensureOwner(id, sceneId, session.user.id)
  if (!check.ok) return check.res

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }
  const data = parsed.data

  if (data.action === 'set_primary') {
    if (check.scene.status !== 'READY' || !check.scene.videoUrl) {
      return jsonError('Scene belum READY — tidak bisa di-set primary', 400)
    }
    if (!check.scene.isEnabled) {
      return jsonError('Scene disabled — aktifkan dulu sebelum di-set primary', 400)
    }
    await prisma.$transaction([
      prisma.hostScene.updateMany({
        where: { hostTemplateId: id, isPrimary: true },
        data: { isPrimary: false },
      }),
      prisma.hostScene.update({
        where: { id: sceneId },
        data: { isPrimary: true },
      }),
      prisma.hostTemplate.update({
        where: { id },
        data: {
          videoLoopUrl: check.scene.videoUrl,
          videoSeconds: check.scene.videoSeconds ?? undefined,
        },
      }),
    ])
    return jsonOk({ id: sceneId, isPrimary: true })
  }

  if (data.action === 'toggle') {
    // Disable scene → kalau dia primary, promote next enabled READY scene
    // jadi primary (atau kosongkan kalau gak ada). Re-enable = no side effect.
    const wasPrimary = check.scene.isPrimary
    await prisma.hostScene.update({
      where: { id: sceneId },
      data: { isEnabled: data.isEnabled },
    })
    if (!data.isEnabled && wasPrimary) {
      const nextPrimary = await prisma.hostScene.findFirst({
        where: {
          hostTemplateId: id,
          status: 'READY',
          isEnabled: true,
          NOT: { id: sceneId },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      })
      if (nextPrimary) {
        await prisma.$transaction([
          prisma.hostScene.update({
            where: { id: sceneId },
            data: { isPrimary: false },
          }),
          prisma.hostScene.update({
            where: { id: nextPrimary.id },
            data: { isPrimary: true },
          }),
          prisma.hostTemplate.update({
            where: { id },
            data: {
              videoLoopUrl: nextPrimary.videoUrl,
              videoSeconds: nextPrimary.videoSeconds ?? undefined,
            },
          }),
        ])
      } else {
        // Tidak ada kandidat enabled lain — primary kosongkan, videoLoopUrl null.
        await prisma.$transaction([
          prisma.hostScene.update({
            where: { id: sceneId },
            data: { isPrimary: false },
          }),
          prisma.hostTemplate.update({
            where: { id },
            data: { videoLoopUrl: null, videoSeconds: null },
          }),
        ])
      }
    }
    return jsonOk({ id: sceneId, isEnabled: data.isEnabled })
  }

  if (data.action === 'update') {
    const updated = await prisma.hostScene.update({
      where: { id: sceneId },
      data: {
        name: data.name ?? undefined,
        description: data.description ?? undefined,
        promptVideo: data.promptVideo ?? undefined,
      },
    })
    return jsonOk({ id: updated.id })
  }

  // regenerate
  if (!check.sourceImageUrl) {
    return jsonError('Gambar host tidak ada', 400)
  }
  if (check.scene.status === 'GENERATING') {
    return jsonError('Scene sedang generate. Tunggu selesai.', 409)
  }
  try {
    const promptMotion = data.promptVideo ?? check.scene.promptVideo
    if (data.promptVideo) {
      await prisma.hostScene.update({
        where: { id: sceneId },
        data: { promptVideo: promptMotion },
      })
    }
    await enqueueVideoJob({
      userId: session.user.id,
      hostTemplateId: id,
      hostSceneId: sceneId,
      imageUrl: check.sourceImageUrl,
      promptMotion,
      durationSeconds: data.durationSeconds,
      publicBaseUrl: getPublicBaseUrl(req),
    })
    return jsonOk({ id: sceneId, status: 'GENERATING' })
  } catch (err) {
    await prisma.hostScene.update({
      where: { id: sceneId },
      data: { status: 'FAILED', errorMessage: (err as Error).message.slice(0, 500) },
    })
    if (err instanceof InsufficientBalanceError) {
      return jsonError(
        `Saldo token kurang. Butuh ±${err.tokensRequired} token.`,
        402,
      )
    }
    return jsonError(
      `Submit Kling gagal: ${(err as Error).message.slice(0, 300)}`,
      500,
    )
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; sceneId: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id, sceneId } = await params
  const check = await ensureOwner(id, sceneId, session.user.id)
  if (!check.ok) return check.res

  const wasPrimary = check.scene.isPrimary
  await prisma.hostScene.delete({ where: { id: sceneId } })
  if (wasPrimary) {
    // Promote scene READY berikutnya jadi primary (kalau ada).
    const next = await prisma.hostScene.findFirst({
      where: { hostTemplateId: id, status: 'READY' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
    if (next) {
      await prisma.$transaction([
        prisma.hostScene.update({
          where: { id: next.id },
          data: { isPrimary: true },
        }),
        prisma.hostTemplate.update({
          where: { id },
          data: { videoLoopUrl: next.videoUrl, videoSeconds: next.videoSeconds ?? undefined },
        }),
      ])
    } else {
      await prisma.hostTemplate.update({
        where: { id },
        data: { videoLoopUrl: null, videoSeconds: null },
      })
    }
  }
  return jsonOk({ deleted: sceneId })
}
