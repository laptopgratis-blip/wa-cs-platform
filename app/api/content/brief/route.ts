// POST /api/content/brief — create new brief
// GET  /api/content/brief — list user briefs
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import {
  DEFAULT_FUNNEL_MIX,
  createBrief,
  listBriefsForOwner,
} from '@/lib/services/content/brief'

const createSchema = z.object({
  lpId: z.string().optional(),
  manualTitle: z.string().max(200).optional(),
  manualAudience: z.string().max(2000).optional(),
  manualOffer: z.string().max(2000).optional(),
  tone: z
    .enum(['CASUAL', 'EDUKATIF', 'AGGRESSIVE_OFFER', 'STORYTELLING'])
    .optional(),
  funnelMix: z
    .object({
      tofu: z.number().int().min(0).max(20),
      mofu: z.number().int().min(0).max(20),
      bofu: z.number().int().min(0).max(20),
    })
    .optional(),
})

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')

  try {
    const brief = await createBrief({
      userId: session.user.id,
      lpId: parsed.data.lpId,
      manualTitle: parsed.data.manualTitle,
      manualAudience: parsed.data.manualAudience,
      manualOffer: parsed.data.manualOffer,
      tone: parsed.data.tone,
      funnelMix: parsed.data.funnelMix ?? DEFAULT_FUNNEL_MIX,
    })
    return jsonOk({ brief })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Gagal create brief', 400)
  }
}

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const briefs = await listBriefsForOwner(session.user.id)
  return jsonOk({ briefs })
}
