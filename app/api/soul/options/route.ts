// GET /api/soul/options
// Endpoint untuk user (SoulBuilder dropdown). Hanya return id/name/description
// dari record yang isActive=true. systemPromptSnippet TIDAK boleh keluar dari
// sini — itu rahasia perusahaan dan hanya bisa dilihat di /api/admin/*.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const [personalities, styles] = await Promise.all([
      prisma.soulPersonality.findMany({
        where: { isActive: true },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, description: true },
      }),
      prisma.soulStyle.findMany({
        where: { isActive: true },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, description: true },
      }),
    ])
    return jsonOk({ personalities, styles })
  } catch (err) {
    console.error('[GET /api/soul/options] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
