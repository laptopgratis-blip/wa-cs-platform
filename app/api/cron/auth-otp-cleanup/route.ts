// GET/POST /api/cron/auth-otp-cleanup?secret=...
// Hapus AuthOtp yang sudah expired >1 hari atau sudah used >7 hari.
// Dipanggil cron eksternal 1x sehari.
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const url = new URL(req.url)
  return (
    url.searchParams.get('secret') === expected ||
    req.headers.get('x-cron-secret') === expected
  )
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }
  const now = new Date()
  const expiredCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const usedCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [expiredDel, usedDel] = await Promise.all([
    prisma.authOtp.deleteMany({
      where: { expiresAt: { lt: expiredCutoff } },
    }),
    prisma.authOtp.deleteMany({
      where: { used: true, createdAt: { lt: usedCutoff } },
    }),
  ])

  return NextResponse.json({
    success: true,
    data: {
      expiredDeleted: expiredDel.count,
      usedDeleted: usedDel.count,
    },
  })
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
