// POST /api/lp/[lpId]/live-embed/analyze — trigger bridge analyzer manual.
// Body: { daysWindow?: number, minObjectionCount?: number }
//
// Output: ringkasan agregat objection + lpOptimizationId baru (kalau ada
// data yg sesuai). Idempotent harian — kalau sudah ada hasil dalam 24 jam,
// return existing.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { proposeLpFromLiveObjections } from '@/lib/services/lp-optimization/from-live-objections'

interface Params {
  params: Promise<{ lpId: string }>
}

const bodySchema = z.object({
  daysWindow: z.number().int().min(1).max(90).default(14),
  minObjectionCount: z.number().int().min(1).max(50).default(2),
})

export async function POST(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params

  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: { userId: true },
  })
  if (!lp) return jsonError('LP tidak ditemukan', 404)
  if (lp.userId !== session.user.id) return jsonError('Forbidden', 403)

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid', 400)
  }

  const result = await proposeLpFromLiveObjections({
    lpId,
    daysWindow: parsed.data.daysWindow,
    minObjectionCount: parsed.data.minObjectionCount,
  })

  return jsonOk(result)
}
