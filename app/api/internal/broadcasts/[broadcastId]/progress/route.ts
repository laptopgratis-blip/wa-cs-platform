// POST /api/internal/broadcasts/[broadcastId]/progress
// Dipanggil wa-service untuk update progress saat broadcast jalan.
// Body: { totalSent?, totalFailed?, status?, completedAt? }
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  totalSent: z.number().int().nonnegative().optional(),
  totalFailed: z.number().int().nonnegative().optional(),
  status: z.enum(['SENDING', 'COMPLETED', 'CANCELLED', 'FAILED']).optional(),
  completedAt: z.string().datetime({ offset: true }).optional(),
})

interface Params {
  params: Promise<{ broadcastId: string }>
}

export async function POST(req: Request, { params }: Params) {
  const blocked = requireServiceSecret(req)
  if (blocked) return blocked

  const { broadcastId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'invalid' },
      { status: 400 },
    )
  }

  try {
    const data: Record<string, unknown> = {}
    if (parsed.data.totalSent !== undefined) data.totalSent = parsed.data.totalSent
    if (parsed.data.totalFailed !== undefined) data.totalFailed = parsed.data.totalFailed
    if (parsed.data.status !== undefined) data.status = parsed.data.status
    if (parsed.data.completedAt !== undefined) {
      data.completedAt = new Date(parsed.data.completedAt)
    }

    const updated = await prisma.broadcast.update({
      where: { id: broadcastId },
      data,
      select: {
        id: true,
        status: true,
        totalSent: true,
        totalFailed: true,
        completedAt: true,
      },
    })
    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    console.error('[POST /api/internal/broadcasts/:id/progress] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
