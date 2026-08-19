// GET  /api/whatsapp/[sessionId]/coex-sync — snapshot status sync coexistence
// POST /api/whatsapp/[sessionId]/coex-sync — mulai/ulang sync manual (kalau
//      trigger otomatis saat onboarding gagal, mis. webhook sempat belum aktif)
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { startCoexistenceSync } from '@/lib/services/waba/coexistence-sync'

interface Params {
  params: Promise<{ sessionId: string }>
}

const snapshotSelect = {
  id: true,
  isCoexistence: true,
  coexContactSyncStatus: true,
  coexContactsImported: true,
  coexHistorySyncStatus: true,
  coexHistorySyncProgress: true,
  coexMessagesImported: true,
  coexSyncRequestedAt: true,
  coexSyncError: true,
} as const

async function loadSnapshot(sessionId: string, userId: string) {
  const s = await prisma.whatsappSession.findFirst({
    where: { id: sessionId, userId, provider: 'CLOUD_API' },
    select: snapshotSelect,
  })
  if (!s) return null
  return {
    isCoexistence: s.isCoexistence,
    contact: { status: s.coexContactSyncStatus, count: s.coexContactsImported },
    history: {
      status: s.coexHistorySyncStatus,
      progress: s.coexHistorySyncProgress,
      count: s.coexMessagesImported,
    },
    error: s.coexSyncError,
    requestedAt: s.coexSyncRequestedAt?.toISOString() ?? null,
  }
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { sessionId } = await params
  try {
    const snap = await loadSnapshot(sessionId, session.user.id)
    if (!snap) return jsonError('Sesi tidak ditemukan', 404)
    return jsonOk(snap)
  } catch (err) {
    console.error('[GET /api/whatsapp/:id/coex-sync] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { sessionId } = await params
  try {
    const before = await loadSnapshot(sessionId, session.user.id)
    if (!before) return jsonError('Sesi tidak ditemukan', 404)
    if (!before.isCoexistence) {
      return jsonError('Sinkronisasi hanya untuk nomor coexistence (terhubung dari WA Business App)', 400)
    }
    await startCoexistenceSync(sessionId)
    const after = await loadSnapshot(sessionId, session.user.id)
    return jsonOk(after)
  } catch (err) {
    console.error('[POST /api/whatsapp/:id/coex-sync] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
