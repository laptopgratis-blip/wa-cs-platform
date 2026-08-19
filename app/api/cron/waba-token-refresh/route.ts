// GET/POST /api/cron/waba-token-refresh?secret=...
// Pemeliharaan sesi Cloud API. Jadwal: TIAP JAM via cron-job.org.
//
// 1) Penjaga webhook (semua sesi cloud aktif): pastikan override_callback_uri
//    per-WABA masih menunjuk ke hulao. Platform lain di Meta App yang sama
//    (kirimchat: onboarding ulang / cron re-subscribe per jam dengan body
//    kosong) MENGHAPUS override kita diam-diam → pesan berhenti tanpa jejak.
// 2) Refresh token yang mendekati kedaluwarsa (long-lived ±60 hari): refresh
//    saat sisa < 14 hari; gagal & sisa < 3 hari → sesi ERROR actionable.
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { encrypt, decrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'
import { refreshLongLivedToken } from '@/lib/services/waba/oauth'
import { ensureWebhookOverride } from '@/lib/services/waba/resources'

const REFRESH_BEFORE_MS = 14 * 24 * 60 * 60 * 1000
const ERROR_BEFORE_MS = 3 * 24 * 60 * 60 * 1000

async function handle(req: Request) {
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  try {
    // ── 1) Penjaga webhook ──
    const active = await prisma.whatsappSession.findMany({
      where: {
        provider: 'CLOUD_API',
        isActive: true,
        wabaTokenEnc: { not: null },
        wabaId: { not: null },
        status: { not: 'DISCONNECTED' },
      },
      select: { id: true, wabaId: true, wabaTokenEnc: true },
      take: 200,
    })
    let webhookChecked = 0
    let webhookRepaired = 0
    let webhookFailed = 0
    const seenWaba = new Set<string>()
    for (const s of active) {
      const wabaId = s.wabaId as string
      if (seenWaba.has(wabaId)) continue // satu WABA cukup dicek sekali
      seenWaba.add(wabaId)
      let token: string
      try {
        token = decrypt(s.wabaTokenEnc as string)
      } catch {
        webhookFailed += 1
        continue
      }
      webhookChecked += 1
      const r = await ensureWebhookOverride(wabaId, token)
      if (!r.ok) {
        webhookFailed += 1
        console.error(`[cron/waba] webhook override WABA ${wabaId} gagal dipastikan: ${r.error}`)
      } else if (r.repaired) {
        webhookRepaired += 1
        console.warn(`[cron/waba] webhook override WABA ${wabaId} HILANG → dipasang ulang`)
      }
    }

    // ── 2) Refresh token ──
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
      data: {
        webhook: { checked: webhookChecked, repaired: webhookRepaired, failed: webhookFailed },
        token: { candidates: sessions.length, refreshed, failed },
      },
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
