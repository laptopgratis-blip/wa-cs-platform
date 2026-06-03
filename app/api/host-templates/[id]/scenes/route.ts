// GET /api/host-templates/[id]/scenes — list scenes per host.
// POST /api/host-templates/[id]/scenes — create scene (dari template atau custom).
//   Body: { name, description?, promptVideo, source?, generate?: boolean,
//           durationSeconds?: 5|10 }
//   Kalau generate=true, langsung submit Kling. Else status=DRAFT.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { InsufficientBalanceError } from '@/lib/services/ai-generation-log'
import { enqueueVideoJob } from '@/lib/services/host-gen/queue'
import { getSceneTemplate } from '@/lib/services/host-gen/scene-templates'
import { prisma } from '@/lib/prisma'

const ALLOWED_CATEGORIES = [
  'idle',
  'greeting',
  'listening',
  'thinking',
  'talking',
  'excited',
  'product',
] as const

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(800).optional(),
  promptVideo: z.string().trim().min(20).max(2000),
  source: z.string().trim().max(80).default('CUSTOM'),
  // Untuk custom scene, user pilih kategori. Untuk preset, di-override
  // dari template lookup (source field).
  category: z.enum(ALLOWED_CATEGORIES).optional(),
  generate: z.boolean().default(false),
  durationSeconds: z.union([z.literal(5), z.literal(10)]).default(5),
})

function getPublicBaseUrl(req: Request): string {
  const env = process.env.NEXTAUTH_URL?.trim()
  if (env) return env
  const proto = req.headers.get('x-forwarded-proto') ?? 'http'
  const host = req.headers.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}

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
    select: { id: true, userId: true, isPublic: true },
  })
  if (!host) return jsonError('Host tidak ditemukan', 404)
  if (host.userId !== session.user.id) return jsonError('Akses ditolak', 403)

  const scenes = await prisma.hostScene.findMany({
    where: { hostTemplateId: id },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return jsonOk(scenes)
}

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
    select: { id: true, userId: true, sourceImageUrl: true },
  })
  if (!host) return jsonError('Host tidak ditemukan', 404)
  if (host.userId !== session.user.id) return jsonError('Akses ditolak', 403)

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }
  const data = parsed.data

  if (data.generate && !host.sourceImageUrl) {
    return jsonError('Gambar host belum siap. Tunggu Gemini selesai.', 400)
  }

  const lastSort = await prisma.hostScene.findFirst({
    where: { hostTemplateId: id },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  // Resolve category: kalau source TEMPLATE:xxx → lookup dari preset lib.
  // Kalau CUSTOM → ambil dari body (default 'idle').
  let category: (typeof ALLOWED_CATEGORIES)[number] = data.category ?? 'idle'
  if (data.source.startsWith('TEMPLATE:')) {
    const tplId = data.source.slice('TEMPLATE:'.length)
    const tpl = getSceneTemplate(tplId)
    if (tpl) category = tpl.category
  }

  const scene = await prisma.hostScene.create({
    data: {
      hostTemplateId: id,
      userId: session.user.id,
      name: data.name,
      description: data.description ?? null,
      promptVideo: data.promptVideo,
      source: data.source,
      category,
      sortOrder: (lastSort?.sortOrder ?? -1) + 1,
      status: data.generate ? 'GENERATING' : 'DRAFT',
    },
  })

  if (data.generate && host.sourceImageUrl) {
    try {
      await enqueueVideoJob({
        userId: session.user.id,
        hostTemplateId: id,
        hostSceneId: scene.id,
        imageUrl: host.sourceImageUrl,
        promptMotion: data.promptVideo,
        durationSeconds: data.durationSeconds,
        publicBaseUrl: getPublicBaseUrl(req),
      })
    } catch (err) {
      // Update scene jadi FAILED + return error.
      await prisma.hostScene.update({
        where: { id: scene.id },
        data: {
          status: 'FAILED',
          errorMessage: (err as Error).message.slice(0, 500),
        },
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

  return jsonOk({ id: scene.id })
}
