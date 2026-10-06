// GET/POST /api/cron/followup-relink?secret=...[&userId=][&dryRun=1][&limit=]
//
// Sapu FollowUpTemplate yang masih tertaut ke template Meta WABA tidak aktif
// (seller ganti nomor) atau template DELETED/REJECTED/DISABLED → tautkan ke
// padanan di WABA aktif (purposeKey → nama+bahasa, jumlah variabel sama).
// Tidak pernah submit template ke Meta. Hook real-time (connect WABA, sync
// template, webhook APPROVED) sudah menangani kasus umum; cron ini jaring
// pengaman. Jadwal saran: tiap jam (crontab server, hulao-cron-call.sh).
//
// dryRun=1 → hanya laporan rencana (daftar perubahan + yang tak bisa di-relink).
// Auth: terpusat di lib/cron-auth.ts (Bearer / x-cron-secret / ?secret=).
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireCronAuth } from '@/lib/cron-auth'
import { relinkSweep } from '@/lib/services/followup-meta-relink'

const querySchema = z.object({
  userId: z.string().trim().min(1).max(64).optional(),
  dryRun: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

async function handle(req: Request) {
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  try {
    const params = Object.fromEntries(new URL(req.url).searchParams)
    const parsed = querySchema.safeParse({
      userId: params.userId || undefined,
      dryRun: params.dryRun || undefined,
      limit: params.limit || undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Parameter tidak valid' },
        { status: 400 },
      )
    }
    const report = await relinkSweep(parsed.data)
    return NextResponse.json({ success: true, data: report })
  } catch (err) {
    console.error('[cron/followup-relink] gagal:', err)
    return NextResponse.json({ success: false, error: 'internal error' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
