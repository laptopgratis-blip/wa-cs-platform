// GET /api/admin/soul-lab/setup — return data form: list SoulPersonality
// (aktif) + SoulStyle (aktif) + AiModel aktif. Source data: Soul Settings.
//
// systemPromptSnippet TIDAK dikembalikan — admin tidak butuh untuk dropdown,
// dan menjaga konsistensi privasi field "rahasia perusahaan".
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const [personalities, styles, models, knowledge] = await Promise.all([
      prisma.soulPersonality.findMany({
        where: { isActive: true },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, description: true, order: true },
      }),
      prisma.soulStyle.findMany({
        where: { isActive: true },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, description: true, order: true },
      }),
      prisma.aiModel.findMany({
        where: { isActive: true },
        orderBy: [{ provider: 'asc' }, { costPerMessage: 'asc' }],
        select: {
          id: true,
          name: true,
          provider: true,
          modelId: true,
          inputPricePer1M: true,
          outputPricePer1M: true,
        },
      }),
      // Knowledge entries semua user — admin pilih cherry-pick saat setup
      // simulasi supaya bisa test seller dengan KB realistis. Hanya yg active.
      // textContent/caption disertakan supaya admin bisa preview di list.
      prisma.userKnowledge.findMany({
        where: { isActive: true },
        orderBy: [{ updatedAt: 'desc' }],
        take: 500,
        select: {
          id: true,
          title: true,
          contentType: true,
          textContent: true,
          caption: true,
          triggerKeywords: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ])
    return jsonOk({ personalities, styles, models, knowledge })
  } catch (err) {
    console.error('[GET /api/admin/soul-lab/setup] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
