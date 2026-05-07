// GET /api/admin/server-status — admin-only.
// Snapshot kondisi VPS untuk monitor operasional:
//   - Disk usage (df -h /)
//   - Total uploads (LpImage aggregate)
//   - User distribution per LP tier
//   - Top 5 user by storage
//   - LP stats: total, published, draft
//   - LpVisit stats 30 hari terakhir
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const execAsync = promisify(exec)

async function getDiskUsage(): Promise<{
  total: string
  used: string
  available: string
  usedPct: string
} | null> {
  try {
    const { stdout } = await execAsync('df -h / | tail -1')
    const parts = stdout.trim().split(/\s+/)
    // Format: <fs> <total> <used> <avail> <use%> <mount>
    return {
      total: parts[1] ?? '?',
      used: parts[2] ?? '?',
      available: parts[3] ?? '?',
      usedPct: parts[4] ?? '?',
    }
  } catch (err) {
    console.warn('[server-status] df gagal:', (err as Error).message)
    return null
  }
}

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }

  try {
    const [
      diskUsage,
      uploadAgg,
      tiersAgg,
      topStorage,
      lpStats,
      visits30d,
      totalLpCount,
    ] = await Promise.all([
      getDiskUsage(),
      prisma.lpImage.aggregate({
        _sum: { size: true },
        _count: true,
      }),
      prisma.userQuota.groupBy({
        by: ['tier'],
        _count: true,
      }),
      prisma.lpImage.groupBy({
        by: ['userId'],
        _sum: { size: true },
        orderBy: { _sum: { size: 'desc' } },
        take: 5,
      }),
      prisma.landingPage.groupBy({
        by: ['isPublished'],
        _count: true,
      }),
      prisma.lpVisit.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.landingPage.count(),
    ])

    // Resolve top user emails (max 5 — cheap query).
    const topUserIds = topStorage.map((t) => t.userId)
    const topUsers =
      topUserIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: topUserIds } },
            select: { id: true, email: true, name: true },
          })
        : []
    const topUserMap = new Map(topUsers.map((u) => [u.id, u]))

    return jsonOk({
      disk: diskUsage,
      uploads: {
        totalGb: ((uploadAgg._sum.size ?? 0) / 1e9).toFixed(2),
        totalMb: ((uploadAgg._sum.size ?? 0) / 1e6).toFixed(1),
        files: uploadAgg._count,
      },
      tiers: tiersAgg.map((t) => ({ tier: t.tier, count: t._count })),
      topStorage: topStorage.map((t) => {
        const u = topUserMap.get(t.userId)
        return {
          userId: t.userId,
          email: u?.email ?? null,
          name: u?.name ?? null,
          totalMb: ((t._sum.size ?? 0) / 1e6).toFixed(1),
        }
      }),
      lp: {
        total: totalLpCount,
        published:
          lpStats.find((s) => s.isPublished === true)?._count ?? 0,
        draft: lpStats.find((s) => s.isPublished === false)?._count ?? 0,
      },
      visits30d,
    })
  } catch (err) {
    console.error('[GET /api/admin/server-status] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
