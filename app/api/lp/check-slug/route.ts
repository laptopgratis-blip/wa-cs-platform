// GET /api/lp/check-slug?slug=... — cek availability slug untuk validasi realtime
// di form CreateLpModal. Return { available: boolean, reason?: string }.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { slugSchema } from '@/lib/validations/lp'

export async function GET(req: Request) {
  try {
    await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const slug = (url.searchParams.get('slug') ?? '').trim()
  const parsed = slugSchema.safeParse(slug)
  if (!parsed.success) {
    return jsonOk({
      available: false,
      reason: parsed.error.issues[0]?.message ?? 'Slug tidak valid',
    })
  }

  try {
    const existing = await prisma.landingPage.findUnique({
      where: { slug: parsed.data },
      select: { id: true },
    })
    if (existing) {
      return jsonOk({ available: false, reason: 'Slug sudah dipakai LP lain' })
    }
    return jsonOk({ available: true })
  } catch (err) {
    console.error('[GET /api/lp/check-slug] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
