// POST /api/subscription/cancel
// Body: { subscriptionId, reason? }
// User cancel subscription. Tetap aktif sampai endDate, lalu cron expire.
// Tidak refund.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { cancelSubscription } from '@/lib/services/subscription'

const bodySchema = z.object({
  subscriptionId: z.string().min(1),
  reason: z.string().max(500).optional(),
})

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  try {
    const sub = await prisma.subscription.findUnique({
      where: { id: parsed.data.subscriptionId },
      select: { userId: true, status: true, isLifetime: true },
    })
    if (!sub) return jsonError('Subscription tidak ditemukan', 404)
    if (sub.userId !== session.user.id) return jsonError('Forbidden', 403)
    if (sub.isLifetime) {
      return jsonError(
        'Subscription lifetime tidak bisa di-cancel (grandfathered).',
      )
    }
    if (sub.status !== 'ACTIVE' && sub.status !== 'PENDING') {
      return jsonError(
        `Subscription sudah berstatus ${sub.status} — tidak bisa cancel.`,
      )
    }

    await cancelSubscription(
      parsed.data.subscriptionId,
      parsed.data.reason ?? 'User cancel',
      session.user.id,
    )
    return jsonOk({ success: true })
  } catch (err) {
    console.error('[POST /api/subscription/cancel] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
