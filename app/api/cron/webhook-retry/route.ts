// GET/POST /api/cron/webhook-retry?secret=... — jadwal TIAP 5 MENIT.
// 1) Kirim ulang delivery FAILED yang nextRetryAt sudah jatuh tempo.
// 2) Selamatkan PENDING yang macet >2 menit (proses mati sebelum sempat
//    mencoba — percobaan pertama normalnya jalan langsung saat emit).
// 3) Purge delivery >30 hari supaya tabel tidak tumbuh tanpa batas.
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { prisma } from '@/lib/prisma'
import { deliverOne } from '@/lib/services/webhooks/deliver'

export const dynamic = 'force-dynamic'

const MAX_PER_RUN = 50
const STUCK_PENDING_MS = 2 * 60 * 1000
const RETENTION_DAYS = 30

async function handle(req: Request) {
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  const startedAt = Date.now()
  try {
    const now = new Date()
    const due = await prisma.webhookDelivery.findMany({
      where: {
        OR: [
          { status: 'FAILED', nextRetryAt: { lte: now } },
          {
            status: 'PENDING',
            createdAt: { lt: new Date(now.getTime() - STUCK_PENDING_MS) },
          },
        ],
        endpoint: { isActive: true },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_PER_RUN,
      select: { id: true },
    })

    // Paralel: satu delivery lambat tidak boleh menahan seluruh batch (dan
    // tidak bisa lagi menggantung selamanya — postJson kini selalu resolve).
    const outcomes = await Promise.allSettled(due.map((d) => deliverOne(d.id)))
    let sent = 0
    let failed = 0
    for (const o of outcomes) {
      if (o.status === 'fulfilled' && o.value?.ok) sent += 1
      else failed += 1
    }

    const purged = await prisma.webhookDelivery.deleteMany({
      where: {
        createdAt: {
          lt: new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000),
        },
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        due: due.length,
        sent,
        failed,
        purged: purged.count,
        durationMs: Date.now() - startedAt,
      },
    })
  } catch (err) {
    console.error('[cron/webhook-retry] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
