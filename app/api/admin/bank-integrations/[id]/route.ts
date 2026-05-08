// PATCH /api/admin/bank-integrations/:id — toggle isAdminBlocked per user.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Ctx {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (typeof body?.isAdminBlocked !== 'boolean') {
    return jsonError('isAdminBlocked (boolean) wajib')
  }
  try {
    const updated = await prisma.bankMutationIntegration.update({
      where: { id },
      data: { isAdminBlocked: body.isAdminBlocked },
    })
    return jsonOk({
      id: updated.id,
      isAdminBlocked: updated.isAdminBlocked,
    })
  } catch (err) {
    console.error('[PATCH /api/admin/bank-integrations/:id]', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
