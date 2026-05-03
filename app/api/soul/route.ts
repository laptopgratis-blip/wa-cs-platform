// GET /api/soul   — list semua soul milik user
// POST /api/soul  — create soul baru
import { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { buildSystemPrompt } from '@/lib/soul'
import { soulCreateSchema } from '@/lib/validations/soul'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const souls = await prisma.soul.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        name: true,
        personality: true,
        language: true,
        replyStyle: true,
        businessContext: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { waSessions: true } },
      },
    })
    return jsonOk(souls)
  } catch (err) {
    console.error('[GET /api/soul] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const json = await req.json().catch(() => null)
  const parsed = soulCreateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    const data = parsed.data
    const systemPrompt = buildSystemPrompt({
      name: data.name,
      personality: data.personality ?? null,
      language: data.language,
      replyStyle: data.replyStyle ?? null,
      businessContext: data.businessContext ?? null,
    })

    // Kalau soul ini di-set default, batalkan flag default di soul lain milik user.
    const soul = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.soul.updateMany({
          where: { userId: session.user.id, isDefault: true },
          data: { isDefault: false },
        })
      }
      return tx.soul.create({
        data: {
          userId: session.user.id,
          name: data.name,
          personality: data.personality ?? null,
          language: data.language,
          replyStyle: data.replyStyle ?? null,
          businessContext: data.businessContext ?? null,
          isDefault: data.isDefault ?? false,
          systemPrompt,
        },
      })
    })

    return jsonOk(soul, 201)
  } catch (err) {
    console.error('[POST /api/soul] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
