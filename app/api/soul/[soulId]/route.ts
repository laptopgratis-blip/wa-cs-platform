// GET    /api/soul/[soulId] — detail
// PATCH  /api/soul/[soulId] — update sebagian field
// DELETE /api/soul/[soulId] — hapus
import { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { buildSystemPrompt, type Language, type Personality, type ReplyStyle } from '@/lib/soul'
import { soulUpdateSchema } from '@/lib/validations/soul'

interface Params {
  params: Promise<{ soulId: string }>
}

async function ownedSoul(userId: string, soulId: string) {
  return prisma.soul.findFirst({
    where: { id: soulId, userId },
  })
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { soulId } = await params
  const soul = await ownedSoul(session.user.id, soulId)
  if (!soul) return jsonError('Soul tidak ditemukan', 404)
  return jsonOk(soul)
}

export async function PATCH(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { soulId } = await params
  const existing = await ownedSoul(session.user.id, soulId)
  if (!existing) return jsonError('Soul tidak ditemukan', 404)

  const json = await req.json().catch(() => null)
  const parsed = soulUpdateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    const data = parsed.data
    // Merge field lama + baru untuk hitung systemPrompt baru.
    const next = {
      name: data.name ?? existing.name,
      personality: (data.personality !== undefined ? data.personality : existing.personality) as Personality | null,
      language: (data.language ?? existing.language) as Language,
      replyStyle: (data.replyStyle !== undefined ? data.replyStyle : existing.replyStyle) as ReplyStyle | null,
      businessContext:
        data.businessContext !== undefined ? data.businessContext : existing.businessContext,
    }
    const systemPrompt = buildSystemPrompt(next)

    const soul = await prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.soul.updateMany({
          where: { userId: session.user.id, isDefault: true, NOT: { id: soulId } },
          data: { isDefault: false },
        })
      }
      return tx.soul.update({
        where: { id: soulId },
        data: {
          ...next,
          isDefault: data.isDefault ?? existing.isDefault,
          systemPrompt,
        },
      })
    })

    return jsonOk(soul)
  } catch (err) {
    console.error('[PATCH /api/soul/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { soulId } = await params
  const existing = await ownedSoul(session.user.id, soulId)
  if (!existing) return jsonError('Soul tidak ditemukan', 404)

  try {
    // WhatsappSession.soulId akan di-set null otomatis (relation onDelete:SetDefault?)
    // Schema saat ini tidak set onDelete, jadi kita lepas reference manual.
    await prisma.$transaction([
      prisma.whatsappSession.updateMany({
        where: { soulId, userId: session.user.id },
        data: { soulId: null },
      }),
      prisma.soul.delete({ where: { id: soulId } }),
    ])
    return jsonOk({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/soul/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
