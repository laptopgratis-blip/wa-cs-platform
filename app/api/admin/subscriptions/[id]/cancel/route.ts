// POST /api/admin/subscriptions/[id]/cancel
// Body: { reason: string }
// Admin cancel subscription. User tetap akses sampai endDate.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { cancelSubscription } from '@/lib/services/subscription'

const bodySchema = z.object({
  reason: z.string().min(1).max(500),
})

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: Params) {
  let session
  try {
    session = await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    await cancelSubscription(id, parsed.data.reason, session.user.id)
    return jsonOk({ success: true })
  } catch (err) {
    console.error('[POST /api/admin/subscriptions/:id/cancel] gagal:', err)
    return jsonError((err as Error).message, 400)
  }
}
