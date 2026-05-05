// GET    /api/sales-flows/[id]  — detail
// PATCH  /api/sales-flows/[id]  — update sebagian field
// DELETE /api/sales-flows/[id]  — hapus
//
// Saat di-DELETE, OrderSession terkait juga ikut terhapus (cascade di schema).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import {
  SALES_FLOW_LIMIT_PER_USER,
  salesFlowUpdateSchema,
} from '@/lib/validations/sales-flow'

interface Params {
  params: Promise<{ id: string }>
}

async function ownedFlow(userId: string, id: string) {
  return prisma.userSalesFlow.findFirst({
    where: { id, userId },
  })
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const flow = await ownedFlow(session.user.id, id)
  if (!flow) return jsonError('Flow tidak ditemukan', 404)
  return jsonOk({
    ...flow,
    createdAt: flow.createdAt.toISOString(),
    updatedAt: flow.updatedAt.toISOString(),
  })
}

export async function PATCH(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const existing = await ownedFlow(session.user.id, id)
  if (!existing) return jsonError('Flow tidak ditemukan', 404)

  const json = await req.json().catch(() => null)
  const parsed = salesFlowUpdateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  const data = parsed.data

  try {
    // Kalau user mau aktifkan flow yang sebelumnya off, cek limit dulu.
    if (data.isActive === true && !existing.isActive) {
      const activeCount = await prisma.userSalesFlow.count({
        where: { userId: session.user.id, isActive: true },
      })
      if (activeCount >= SALES_FLOW_LIMIT_PER_USER) {
        return jsonError(
          `Sudah mencapai batas ${SALES_FLOW_LIMIT_PER_USER} flow aktif. Nonaktifkan salah satu dulu.`,
          409,
        )
      }
    }

    const updated = await prisma.userSalesFlow.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(data.triggerKeywords !== undefined
          ? { triggerKeywords: data.triggerKeywords }
          : {}),
        ...(data.steps !== undefined ? { steps: data.steps } : {}),
        ...(data.finalAction !== undefined
          ? { finalAction: data.finalAction }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    })
    return jsonOk({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('[PATCH /api/sales-flows/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const existing = await ownedFlow(session.user.id, id)
  if (!existing) return jsonError('Flow tidak ditemukan', 404)
  try {
    await prisma.userSalesFlow.delete({ where: { id } })
    return jsonOk({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/sales-flows/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
