// POST /api/admin/subscriptions/[id]/extend
// Body: { months: 1-60, reason: string }
// Admin perpanjang subscription manual (mis. kompensasi outage).
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { extendSubscription } from '@/lib/services/subscription'

const bodySchema = z.object({
  months: z.number().int().min(1).max(60),
  reason: z.string().min(1).max(500),
})

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const updated = await extendSubscription(
      id,
      parsed.data.months,
      parsed.data.reason,
    )
    return jsonOk({
      id: updated.id,
      endDate: updated.endDate.toISOString(),
      status: updated.status,
    })
  } catch (err) {
    console.error('[POST /api/admin/subscriptions/:id/extend] gagal:', err)
    return jsonError((err as Error).message, 400)
  }
}
