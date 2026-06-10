// POST or GET /api/cron/followup-cleanup
//
// Daily cleanup untuk Follow-Up Order System:
//   - FollowUpLog: hapus > 90 hari
//   - FollowUpQueue dengan status terminal (SENT/SKIPPED/CANCELLED/FAILED): > 60 hari
//
// Setup eksternal: cron-job.org, hit:
//   https://hulao.id/api/cron/followup-cleanup?secret=<CRON_SECRET>
// Frequency: daily.
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { prisma } from '@/lib/prisma'

const DAY_MS = 24 * 60 * 60 * 1000

async function handle(req: Request) {
  // Auth terpusat di lib/cron-auth.ts (Bearer / x-cron-secret / ?secret=).
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  const logCutoff = new Date(Date.now() - 90 * DAY_MS)
  const queueCutoff = new Date(Date.now() - 60 * DAY_MS)

  const [logs, queue] = await Promise.all([
    prisma.followUpLog.deleteMany({ where: { sentAt: { lt: logCutoff } } }),
    prisma.followUpQueue.deleteMany({
      where: {
        status: { in: ['SENT', 'SKIPPED', 'CANCELLED', 'FAILED'] },
        createdAt: { lt: queueCutoff },
      },
    }),
  ])

  return NextResponse.json({
    success: true,
    data: { deletedLogs: logs.count, deletedQueue: queue.count },
  })
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
