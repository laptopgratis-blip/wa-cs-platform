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

import { prisma } from '@/lib/prisma'

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const url = new URL(req.url)
  const queryToken = url.searchParams.get('secret')
  const headerToken = req.headers.get('x-cron-secret')
  return queryToken === expected || headerToken === expected
}

const DAY_MS = 24 * 60 * 60 * 1000

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }

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
