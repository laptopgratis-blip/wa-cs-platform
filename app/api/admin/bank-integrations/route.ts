// Admin endpoint untuk Bank Mutation Auto-Reader (Phase 1 BETA, 2026-05-08).
//
// GET — list semua integration (untuk monitor + kill switch).
// PATCH /api/admin/bank-integrations/:id — toggle isAdminBlocked (di file
//    [id]/route.ts).
// POST { blockAll: true } — emergency stop SEMUA integration.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const url = new URL(req.url)
    const search = url.searchParams.get('q')?.trim() ?? ''

    const where: Record<string, unknown> = {}
    if (search) {
      where.user = {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ],
      }
    }

    const integrations = await prisma.bankMutationIntegration.findMany({
      where,
      orderBy: { lastScrapedAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    })

    return jsonOk({
      integrations: integrations.map((i) => ({
        id: i.id,
        userId: i.userId,
        userEmail: i.user.email,
        userName: i.user.name,
        bankCode: i.bankCode,
        accountNumber: i.accountNumber,
        accountName: i.accountName,
        isActive: i.isActive,
        isAdminBlocked: i.isAdminBlocked,
        isBetaConsented: i.isBetaConsented,
        lastScrapedAt: i.lastScrapedAt?.toISOString() ?? null,
        lastScrapeStatus: i.lastScrapeStatus,
        lastScrapeError: i.lastScrapeError,
        totalMutationsCaptured: i.totalMutationsCaptured,
        totalAutoConfirmed: i.totalAutoConfirmed,
        totalScrapes: i.totalScrapes,
        totalScrapeFailures: i.totalScrapeFailures,
        createdAt: i.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/admin/bank-integrations]', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

// Emergency block all — set isAdminBlocked=true untuk semua integration.
// Gunakan kalau ada masalah BCA detection atau insiden.
export async function POST(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const body = await req.json().catch(() => null)
    if (body?.blockAll === true) {
      const result = await prisma.bankMutationIntegration.updateMany({
        data: { isAdminBlocked: true },
      })
      return jsonOk({ blocked: result.count, mode: 'BLOCK_ALL' })
    }
    if (body?.unblockAll === true) {
      const result = await prisma.bankMutationIntegration.updateMany({
        data: { isAdminBlocked: false },
      })
      return jsonOk({ unblocked: result.count, mode: 'UNBLOCK_ALL' })
    }
    return jsonError('blockAll / unblockAll wajib true')
  } catch (err) {
    console.error('[POST /api/admin/bank-integrations]', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
