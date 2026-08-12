// GET/POST /api/cron/waba-token-refresh?secret=...
// Refresh access token sesi Cloud API yang mendekati kedaluwarsa (long-lived
// token Meta berumur ±60 hari). Jadwal: harian via cron-job.org.
//
// Kebijakan: refresh saat sisa umur < 14 hari; kalau refresh gagal dan sisa
// umur < 3 hari → sesi ERROR + lastError actionable (user hubungkan ulang).
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { encrypt, decrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'
import { refreshLongLivedToken } from '@/lib/services/waba/oauth'

const REFRESH_BEFORE_MS = 14 * 24 * 60 * 60 * 1000
const ERROR_BEFORE_MS = 3 * 24 * 60 * 60 * 1000

async function handle(req: Request) {
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  try {
    const threshold = new Date(Date.now() + REFRESH_BEFORE_MS)
    const sessions = await prisma.whatsappSession.findMany({
      where: {
        provider: 'CLOUD_API',
        isActive: true,
        wabaTokenEnc: { not: null },
        wabaTokenExpiresAt: { lte: threshold },
      },
      select: { id: true, wabaTokenEnc: true, wabaTokenExpiresAt: true },
      take: 50,
    })

    let refreshed = 0
    let failed = 0

    for (const session of sessions) {
      let currentToken: string
      try {
        currentToken = decrypt(session.wabaTokenEnc as string)
      } catch {
        failed += 1
        await prisma.whatsappSession.update({
          where: { id: session.id },
          data: {
            status: 'ERROR',
            lastError: 'Token WABA tidak bisa didekripsi — hubungkan ulang nomor',
          },
        })
        continue
      }

      const result = await refreshLongLivedToken(currentToken)
      if (result.ok && result.accessToken) {
        refreshed += 1
        await prisma.whatsappSession.update({
          where: { id: session.id },
          data: {
            wabaTokenEnc: encrypt(result.accessToken),
            wabaTokenExpiresAt: new Date(
              Date.now() + (result.expiresIn ?? 5_184_000) * 1000,
            ),
          },
        })
      } else {
        failed += 1
        console.error(
          `[cron/waba-token-refresh] refresh gagal sesi ${session.id}: ${result.error}`,
        )
        const expiresAt = session.wabaTokenExpiresAt?.getTime() ?? 0
        if (expiresAt - Date.now() < ERROR_BEFORE_MS) {
          await prisma.whatsappSession.update({
            where: { id: session.id },
            data: {
              status: 'ERROR',
              lastError: `Token Meta hampir kedaluwarsa & refresh gagal: ${result.error} — hubungkan ulang via Embedded Signup`,
            },
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: { candidates: sessions.length, refreshed, failed },
    })
  } catch (err) {
    console.error('[cron/waba-token-refresh] gagal:', err)
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
