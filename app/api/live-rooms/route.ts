// GET  /api/live-rooms — list rooms milik user.
// POST /api/live-rooms — bikin room baru. Validasi slug unique + hostTemplate
//                        eksis (boleh punya admin yg isPublic atau punya sendiri).
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { sanitizeProductFormMap } from '@/lib/services/live/order-form'

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,60}[a-z0-9])?$/

const createSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_RE, 'Slug: huruf kecil, angka, dan strip. 2-62 karakter.'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  hostTemplateId: z.string().trim().min(1),
  productIds: z.array(z.string()).max(40).default([]),
  featuredProductId: z.string().trim().nullable().optional(),
  systemPrompt: z.string().trim().min(20).max(4000),
  greeting: z.string().trim().max(500).optional(),
  ttsVoice: z.string().trim().max(40).default('alloy'),
  // Form checkout default + override per-produk — sebelumnya field ini di-strip
  // diam-diam oleh schema sehingga pilihan form saat CREATE tidak pernah tersimpan.
  orderFormSlug: z.string().trim().max(80).nullable().optional(),
  productFormMap: z
    .record(z.string(), z.string().trim().min(1).max(80))
    .nullable()
    .optional(),
})

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const rows = await prisma.liveRoom.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      ttsVoice: true,
      createdAt: true,
      hostTemplate: { select: { id: true, name: true, status: true, videoLoopUrl: true } },
    },
  })
  return jsonOk(rows)
}

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }
  const data = parsed.data

  // Slug uniqueness check (sebelum insert untuk error message bagus).
  const exists = await prisma.liveRoom.findUnique({
    where: { slug: data.slug },
    select: { id: true },
  })
  if (exists) {
    return jsonError(`Slug "${data.slug}" sudah dipakai. Pilih yang lain.`, 409)
  }

  // Host template harus ada — punya admin (isPublic) atau punya user sendiri.
  const host = await prisma.hostTemplate.findUnique({
    where: { id: data.hostTemplateId },
    select: { id: true, userId: true, isPublic: true, status: true, videoLoopUrl: true },
  })
  if (!host) return jsonError('Host template tidak ditemukan', 404)
  if (host.userId !== session.user.id && !host.isPublic) {
    return jsonError('Host template tidak boleh dipakai (private milik user lain)', 403)
  }
  if (host.status !== 'READY' || !host.videoLoopUrl) {
    return jsonError('Host belum siap (video belum di-generate)', 400)
  }

  // Validasi semua productIds milik user ini.
  if (data.productIds.length > 0) {
    const validProducts = await prisma.product.count({
      where: { id: { in: data.productIds }, userId: session.user.id },
    })
    if (validProducts !== data.productIds.length) {
      return jsonError('Sebagian product tidak ditemukan / bukan milik Anda', 400)
    }
  }

  // featuredProductId (kalau ada) harus termasuk productIds room.
  const featuredProductId =
    data.featuredProductId && data.productIds.includes(data.featuredProductId)
      ? data.featuredProductId
      : null

  // Form default: harus milik user. Invalid → simpan null (bukan reject).
  let orderFormSlug: string | null = null
  if (data.orderFormSlug) {
    const form = await prisma.orderForm.findUnique({
      where: { slug: data.orderFormSlug },
      select: { userId: true, isActive: true },
    })
    if (form && form.userId === session.user.id && form.isActive) {
      orderFormSlug = data.orderFormSlug
    }
  }

  // Form per-produk: entri invalid di-drop (validasi sama dengan PUT).
  const productFormMap = data.productFormMap
    ? await sanitizeProductFormMap({
        rawMap: data.productFormMap,
        userId: session.user.id,
        productIds: data.productIds,
      })
    : null

  const created = await prisma.liveRoom.create({
    data: {
      userId: session.user.id,
      slug: data.slug,
      name: data.name,
      description: data.description ?? null,
      hostTemplateId: data.hostTemplateId,
      productIds: data.productIds,
      featuredProductId,
      systemPrompt: data.systemPrompt,
      greeting: data.greeting ?? null,
      ttsVoice: data.ttsVoice,
      orderFormSlug,
      ...(productFormMap ? { productFormMap } : {}),
    },
    select: { id: true, slug: true },
  })
  return jsonOk(created)
}
