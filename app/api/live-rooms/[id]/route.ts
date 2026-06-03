// GET/PUT/DELETE /api/live-rooms/[id] — kelola room milik user.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  hostTemplateId: z.string().trim().min(1).optional(),
  productIds: z.array(z.string()).max(40).optional(),
  systemPrompt: z.string().trim().min(20).max(4000).optional(),
  greeting: z.string().trim().max(500).nullable().optional(),
  ttsVoice: z.string().trim().max(40).optional(),
  ttsInstructions: z.string().trim().max(2000).nullable().optional(),
  ttsSpeed: z.number().min(0.5).max(2).optional(),
  ttsPitchOffset: z.number().min(-1).max(1).optional(),
  ttsExpressiveness: z.number().min(0).max(1).optional(),
  ttsPauseMs: z.number().int().min(0).max(2000).optional(),
  chatModel: z
    .enum([
      'claude-haiku-4-5',
      'claude-sonnet-4-6',
      'gpt-5-mini',
      'gpt-5',
      'gpt-4o-mini',
    ])
    .optional(),
  chatTemperature: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
  botEnabled: z.boolean().optional(),
  botIntervalMinSec: z.number().int().min(10).max(600).optional(),
  botIntervalMaxSec: z.number().int().min(10).max(600).optional(),
  botPrompts: z.array(z.string().trim().min(3).max(300)).max(40).optional(),
  // Slug OrderForm publik untuk "klik produk → order langsung". Empty
  // string atau null = unlink.
  orderFormSlug: z.string().trim().max(80).nullable().optional(),
})

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
  const room = await prisma.liveRoom.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      slug: true,
      name: true,
      description: true,
      hostTemplateId: true,
      productIds: true,
      systemPrompt: true,
      greeting: true,
      ttsVoice: true,
      ttsInstructions: true,
      ttsSpeed: true,
      ttsPitchOffset: true,
      ttsExpressiveness: true,
      ttsPauseMs: true,
      chatModel: true,
      chatTemperature: true,
      isActive: true,
      botEnabled: true,
      botIntervalMinSec: true,
      botIntervalMaxSec: true,
      botPrompts: true,
      orderFormSlug: true,
      createdAt: true,
      updatedAt: true,
      hostTemplate: { select: { name: true, videoLoopUrl: true, sourceImageUrl: true } },
    },
  })
  if (!room) return jsonError('Tidak ditemukan', 404)
  if (room.userId !== session.user.id) return jsonError('Akses ditolak', 403)
  return jsonOk(room)
}

export async function PUT(
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
  const existing = await prisma.liveRoom.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (!existing) return jsonError('Tidak ditemukan', 404)
  if (existing.userId !== session.user.id) return jsonError('Akses ditolak', 403)

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }
  const data = parsed.data

  if (data.productIds) {
    const validProducts = await prisma.product.count({
      where: { id: { in: data.productIds }, userId: session.user.id },
    })
    if (validProducts !== data.productIds.length) {
      return jsonError('Sebagian product tidak ditemukan / bukan milik Anda', 400)
    }
  }

  if (data.orderFormSlug !== undefined && data.orderFormSlug) {
    const form = await prisma.orderForm.findUnique({
      where: { slug: data.orderFormSlug },
      select: { userId: true, isActive: true },
    })
    if (!form || form.userId !== session.user.id) {
      return jsonError('Order form tidak ditemukan / bukan milik Anda', 400)
    }
  }

  if (data.hostTemplateId) {
    const host = await prisma.hostTemplate.findUnique({
      where: { id: data.hostTemplateId },
      select: { userId: true, isPublic: true, status: true, videoLoopUrl: true },
    })
    if (!host) return jsonError('Host template tidak ditemukan', 404)
    if (host.userId !== session.user.id && !host.isPublic) {
      return jsonError('Host tidak boleh dipakai (private milik user lain)', 403)
    }
    if (host.status !== 'READY' || !host.videoLoopUrl) {
      return jsonError('Host belum siap (video belum di-generate)', 400)
    }
  }

  const updated = await prisma.liveRoom.update({
    where: { id },
    data,
    select: { id: true, slug: true, isActive: true },
  })
  return jsonOk(updated)
}

export async function DELETE(
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
  const existing = await prisma.liveRoom.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (!existing) return jsonError('Tidak ditemukan', 404)
  if (existing.userId !== session.user.id) return jsonError('Akses ditolak', 403)
  await prisma.liveRoom.delete({ where: { id } })
  return jsonOk({ deleted: id })
}
