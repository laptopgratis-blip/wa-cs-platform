// GET   /api/shipping-profile — ambil profil shipping user (auto-create kalau belum ada).
// PATCH /api/shipping-profile — update WA confirm settings (Phase 1) atau origin
//                                & couriers (Phase 2).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { shippingProfileSchema } from '@/lib/validations/bank-account'

async function getOrCreate(userId: string) {
  const existing = await prisma.userShippingProfile.findUnique({
    where: { userId },
  })
  if (existing) return existing
  return prisma.userShippingProfile.create({ data: { userId } })
}

export async function GET() {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }

  try {
    const profile = await getOrCreate(session.user.id)
    return jsonOk({
      ...profile,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('[GET /api/shipping-profile] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function PATCH(req: Request) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }

  const json = await req.json().catch(() => null)
  const parsed = shippingProfileSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    await getOrCreate(session.user.id)
    const data = parsed.data
    const updated = await prisma.userShippingProfile.update({
      where: { userId: session.user.id },
      data: {
        ...(data.waConfirmNumber !== undefined && {
          waConfirmNumber: data.waConfirmNumber,
        }),
        ...(data.waConfirmTemplate !== undefined && {
          waConfirmTemplate: data.waConfirmTemplate,
        }),
        ...(data.waConfirmActive !== undefined && {
          waConfirmActive: data.waConfirmActive,
        }),
        ...(data.originCityId !== undefined && {
          originCityId: data.originCityId,
        }),
        ...(data.originCityName !== undefined && {
          originCityName: data.originCityName,
        }),
        ...(data.originProvinceName !== undefined && {
          originProvinceName: data.originProvinceName,
        }),
        ...(data.enabledCouriers !== undefined && {
          enabledCouriers: data.enabledCouriers,
        }),
        ...(data.defaultWeightGrams !== undefined && {
          defaultWeightGrams: data.defaultWeightGrams,
        }),
      },
    })
    return jsonOk({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('[PATCH /api/shipping-profile] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
