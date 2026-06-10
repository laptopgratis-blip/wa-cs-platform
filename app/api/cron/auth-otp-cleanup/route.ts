// GET/POST /api/cron/auth-otp-cleanup?secret=...
// Hapus AuthOtp yang sudah expired >1 hari atau sudah used >7 hari.
// Dipanggil cron eksternal 1x sehari.
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { prisma } from '@/lib/prisma'

async function handle(req: Request) {
  // Auth terpusat di lib/cron-auth.ts (Bearer / x-cron-secret / ?secret=).
  const authErr = requireCronAuth(req)
  if (authErr) return authErr
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
