// GET  /api/sales-flows  — list flow milik user (urut order: aktif dulu).
// POST /api/sales-flows  — buat flow baru. Limit 5 active per user.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import {
  SALES_FLOW_LIMIT_PER_USER,
  salesFlowCreateSchema,
} from '@/lib/validations/sales-flow'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const flows = await prisma.userSalesFlow.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        name: true,
        template: true,
        description: true,
        triggerKeywords: true,
        steps: true,
        finalAction: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    const activeCount = flows.filter((f) => f.isActive).length
    return jsonOk({
      flows: flows.map((f) => ({
        ...f,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
      limit: SALES_FLOW_LIMIT_PER_USER,
      activeCount,
    })
  } catch (err) {
    console.error('[GET /api/sales-flows] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const json = await req.json().catch(() => null)
  const parsed = salesFlowCreateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  const data = parsed.data

  try {
    // Hanya cek limit kalau flow di-set aktif. User boleh punya banyak draft
    // (isActive=false) tanpa kena limit.
    if (data.isActive !== false) {
      const active = await prisma.userSalesFlow.count({
        where: { userId: session.user.id, isActive: true },
      })
      if (active >= SALES_FLOW_LIMIT_PER_USER) {
        return jsonError(
          `Sudah mencapai batas ${SALES_FLOW_LIMIT_PER_USER} flow aktif. Nonaktifkan salah satu dulu.`,
          409,
        )
      }
    }

    const created = await prisma.userSalesFlow.create({
      data: {
        userId: session.user.id,
        name: data.name,
        template: data.template,
        description: data.description ?? null,
        triggerKeywords: data.triggerKeywords ?? [],
        steps: data.steps,
        finalAction: data.finalAction,
        isActive: data.isActive ?? true,
      },
    })

    return jsonOk(
      {
        ...created,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      201,
    )
  } catch (err) {
    console.error('[POST /api/sales-flows] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
