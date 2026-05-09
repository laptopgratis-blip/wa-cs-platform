// GET /api/lp/[lpId]/signals?period=30
// Return signals customer concerns dari LpChatSignal cache. Kalau cache stale
// (>6 jam) atau forceRefresh=1, recompute on-demand.
//
// POST /api/lp/[lpId]/signals?period=30
// Force recompute (admin trigger dari UI button).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import {
  extractSignalsForLp,
  persistSignals,
  SIGNAL_LABELS,
  type SignalCategory,
} from '@/lib/services/lp-chat-signals'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ lpId: string }>
}

const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000 // 6 jam

async function ensureFresh(lpId: string, periodDays: number, force: boolean) {
  if (force) {
    const result = await extractSignalsForLp(lpId, periodDays)
    await persistSignals(result, periodDays)
    return
  }
  const oldest = await prisma.lpChatSignal.findFirst({
    where: { landingPageId: lpId, periodDays },
    orderBy: { computedAt: 'asc' },
    select: { computedAt: true },
  })
  // Compute kalau belum pernah, atau sudah stale.
  if (!oldest || Date.now() - oldest.computedAt.getTime() > STALE_THRESHOLD_MS) {
    const result = await extractSignalsForLp(lpId, periodDays)
    await persistSignals(result, periodDays)
  }
}

type AuthResult =
  | { ok: true }
  | { ok: false; error: string; status: number }

async function fetchAndAuth(
  req: Request,
  lpId: string,
  sessionUserId: string,
): Promise<AuthResult> {
  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: {
      userId: true,
      user: { select: { lpQuota: { select: { tier: true } } } },
    },
  })
  if (!lp) return { ok: false, error: 'LP tidak ditemukan', status: 404 }
  if (lp.userId !== sessionUserId)
    return { ok: false, error: 'Forbidden', status: 403 }
  if ((lp.user.lpQuota?.tier ?? 'FREE') !== 'POWER') {
    return { ok: false, error: 'Chat signals eksklusif POWER plan', status: 403 }
  }
  return { ok: true }
}

function parsePeriod(req: Request): number {
  const url = new URL(req.url)
  const p = Number(url.searchParams.get('period') ?? '30')
  if (p === 7 || p === 30 || p === 90) return p
  return 30
}

export async function GET(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params

  const auth = await fetchAndAuth(req, lpId, session.user.id)
  if (!auth.ok) return jsonError(auth.error, auth.status)

  const periodDays = parsePeriod(req)
  const url = new URL(req.url)
  const force = url.searchParams.get('forceRefresh') === '1'

  try {
    await ensureFresh(lpId, periodDays, force)
    const rows = await prisma.lpChatSignal.findMany({
      where: { landingPageId: lpId, periodDays },
      orderBy: { count: 'desc' },
    })
    return jsonOk({
      periodDays,
      signals: rows.map((r) => ({
        category: r.category as SignalCategory,
        label: SIGNAL_LABELS[r.category as SignalCategory] ?? r.category,
        count: r.count,
        samples: Array.isArray(r.sampleQuotes) ? (r.sampleQuotes as string[]) : [],
      })),
      computedAt: rows[0]?.computedAt.toISOString() ?? null,
    })
  } catch (err) {
    console.error('[GET /api/lp/:id/signals] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId } = await params
  const auth = await fetchAndAuth(req, lpId, session.user.id)
  if (!auth.ok) return jsonError(auth.error, auth.status)

  const periodDays = parsePeriod(req)
  try {
    const result = await extractSignalsForLp(lpId, periodDays)
    await persistSignals(result, periodDays)
    return jsonOk({
      periodDays,
      messagesScanned: result.totalMessagesScanned,
      categoriesUpdated: result.signalsByCategory.size,
    })
  } catch (err) {
    console.error('[POST /api/lp/:id/signals] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
