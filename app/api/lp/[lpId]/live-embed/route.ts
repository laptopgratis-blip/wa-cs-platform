// LP × Live AI Embed — CRUD config (owner auth).
// GET    /api/lp/[lpId]/live-embed  → fetch config (kalau ada) + list LiveRoom user
// PUT    /api/lp/[lpId]/live-embed  → upsert config (create kalau belum ada)
// DELETE /api/lp/[lpId]/live-embed  → hapus config
//
// Pola: owner-only. LP harus milik session user, LiveRoom harus milik session user juga.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ lpId: string }>
}

const upsertSchema = z.object({
  liveRoomId: z.string().trim().min(1, 'Pilih LiveRoom dulu'),
  gateMode: z.enum(['REQUIRED', 'OPTIONAL', 'HYBRID', 'OFF']).default('HYBRID'),
  gateFields: z.array(z.enum(['name', 'phone', 'email', 'city', 'productInterest'])).min(1).default(['name', 'phone']),
  gateTriggerSec: z.number().int().min(0).max(600).default(30),
  gateTriggerOnChat: z.boolean().default(true),
  ctaLabel: z.string().trim().min(1).max(64).default('Tanya host live'),
  position: z.enum(['inline', 'floating-br', 'floating-bl', 'floating-tr', 'floating-tl']).default('inline'),
  autoplay: z.boolean().default(true),
  mutedDefault: z.boolean().default(true),
  widthPx: z.number().int().min(280).max(1200).default(420),
  heightPx: z.number().int().min(400).max(1600).default(720),
  isActive: z.boolean().default(true),
})

async function loadOwnedLp(lpId: string, userId: string) {
  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: { id: true, userId: true, slug: true, title: true },
  })
  if (!lp) return { error: jsonError('Landing page tidak ditemukan', 404) }
  if (lp.userId !== userId) return { error: jsonError('Forbidden', 403) }
  return { lp }
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params

  const { lp, error } = await loadOwnedLp(lpId, session.user.id)
  if (error) return error

  const [embed, rooms] = await Promise.all([
    prisma.lpLiveEmbed.findUnique({
      where: { landingPageId: lp!.id },
      include: {
        liveRoom: {
          select: { id: true, slug: true, name: true, isActive: true },
        },
      },
    }),
    prisma.liveRoom.findMany({
      where: { userId: session.user.id },
      select: { id: true, slug: true, name: true, isActive: true, hostTemplate: { select: { mode: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  return jsonOk({
    embed: embed
      ? {
          ...embed,
          gateFields: embed.gateFields,
          createdAt: embed.createdAt.toISOString(),
          updatedAt: embed.updatedAt.toISOString(),
        }
      : null,
    availableRooms: rooms,
    lp: { id: lp!.id, slug: lp!.slug, title: lp!.title },
  })
}

export async function PUT(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params

  const { lp, error } = await loadOwnedLp(lpId, session.user.id)
  if (error) return error

  const parsed = upsertSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }
  const data = parsed.data

  // Pastikan LiveRoom milik user yg sama (jangan embed milik orang).
  const room = await prisma.liveRoom.findUnique({
    where: { id: data.liveRoomId },
    select: { id: true, userId: true, isActive: true },
  })
  if (!room) return jsonError('LiveRoom tidak ditemukan', 404)
  if (room.userId !== session.user.id) return jsonError('LiveRoom bukan milik kamu', 403)

  const embed = await prisma.lpLiveEmbed.upsert({
    where: { landingPageId: lp!.id },
    create: {
      landingPageId: lp!.id,
      liveRoomId: data.liveRoomId,
      userId: session.user.id,
      gateMode: data.gateMode,
      gateFields: data.gateFields,
      gateTriggerSec: data.gateTriggerSec,
      gateTriggerOnChat: data.gateTriggerOnChat,
      ctaLabel: data.ctaLabel,
      position: data.position,
      autoplay: data.autoplay,
      mutedDefault: data.mutedDefault,
      widthPx: data.widthPx,
      heightPx: data.heightPx,
      isActive: data.isActive,
    },
    update: {
      liveRoomId: data.liveRoomId,
      gateMode: data.gateMode,
      gateFields: data.gateFields,
      gateTriggerSec: data.gateTriggerSec,
      gateTriggerOnChat: data.gateTriggerOnChat,
      ctaLabel: data.ctaLabel,
      position: data.position,
      autoplay: data.autoplay,
      mutedDefault: data.mutedDefault,
      widthPx: data.widthPx,
      heightPx: data.heightPx,
      isActive: data.isActive,
    },
  })

  return jsonOk({
    embed: {
      ...embed,
      createdAt: embed.createdAt.toISOString(),
      updatedAt: embed.updatedAt.toISOString(),
    },
  })
}

export async function DELETE(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params

  const { lp, error } = await loadOwnedLp(lpId, session.user.id)
  if (error) return error

  await prisma.lpLiveEmbed.deleteMany({ where: { landingPageId: lp!.id } })
  return jsonOk({ deleted: true })
}
