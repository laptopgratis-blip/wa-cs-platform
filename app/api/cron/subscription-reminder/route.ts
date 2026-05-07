// POST /api/cron/subscription-reminder — daily 09:00 WIB.
// Kirim reminder ke user yg subscription-nya expire dalam 7/3/1 hari.
// Idempotent per (user, subscription, type) — kalau sudah pernah dikirim,
// skip. Lihat unique index SubscriptionNotification(userId, subscriptionId, type).
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import {
  createNotification,
  sendWaNotificationToUser,
} from '@/lib/services/subscription'

const REMINDER_DAYS = [7, 3, 1] as const

export async function POST(req: Request) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }

  const now = new Date()
  const results = { totalSent: 0, byDay: {} as Record<number, number> }

  for (const days of REMINDER_DAYS) {
    // Window: subscription yg endDate-nya jatuh tepat di hari ke-N dari sekarang
    // (bukan ≤ atau ≥). Kalau cron lewat sehari, skip — supaya tidak ngejar
    // backlog (toh urgency-nya turun).
    const startOfTarget = new Date(now)
    startOfTarget.setDate(startOfTarget.getDate() + days)
    startOfTarget.setHours(0, 0, 0, 0)
    const endOfTarget = new Date(startOfTarget)
    endOfTarget.setHours(23, 59, 59, 999)

    const expiringSubs = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        isLifetime: false,
        endDate: { gte: startOfTarget, lte: endOfTarget },
      },
      include: { user: true, lpPackage: true },
    })

    let sentForDay = 0
    const type = `EXPIRING_${days}D`

    for (const sub of expiringSubs) {
      // Idempotency: skip kalau sudah pernah kirim notif type ini.
      const existing = await prisma.subscriptionNotification.findFirst({
        where: {
          userId: sub.userId,
          subscriptionId: sub.id,
          type,
        },
      })
      if (existing) continue

      const dateStr = sub.endDate.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })

      await createNotification({
        userId: sub.userId,
        subscriptionId: sub.id,
        type,
        channel: 'IN_APP',
        title: `⏰ Subscription Berakhir dalam ${days} Hari`,
        message: `Plan ${sub.lpPackage.name} kamu akan berakhir pada ${dateStr}. Perpanjang sekarang untuk lanjut akses fitur premium.`,
        link: '/billing/subscription',
      }).catch((err) =>
        console.error(
          `[cron reminder] createNotification gagal user=${sub.userId}:`,
          err,
        ),
      )

      // WA — best-effort, tidak block.
      void sendWaNotificationToUser(sub.userId, {
        title: `Plan ${sub.lpPackage.name}`,
        message: `Akan berakhir dalam ${days} hari (${dateStr}). Perpanjang di hulao.id/billing/subscription`,
        subscriptionId: sub.id,
      })

      sentForDay++
      results.totalSent++
    }
    results.byDay[days] = sentForDay
  }

  return NextResponse.json({ success: true, data: results })
}
