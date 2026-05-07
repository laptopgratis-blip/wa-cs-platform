// PATCH  /api/bank-accounts/[id] — edit rekening (nama, nomor, status, default).
// DELETE /api/bank-accounts/[id] — hapus rekening user.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { bankAccountUpdateSchema } from '@/lib/validations/bank-account'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }

  const { id } = await params
  const json = await req.json().catch(() => null)
  const parsed = bankAccountUpdateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    // Verifikasi rekening milik user (mencegah akses cross-user).
    const existing = await prisma.userBankAccount.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) return jsonError('Rekening tidak ditemukan', 404)

    const data = parsed.data
    const updated = await prisma.$transaction(async (tx) => {
      // Set default → unset default yang lain dulu.
      if (data.isDefault === true) {
        await tx.userBankAccount.updateMany({
          where: {
            userId: session.user.id,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        })
      }
      return tx.userBankAccount.update({
        where: { id },
        data: {
          ...(data.bankName !== undefined && { bankName: data.bankName }),
          ...(data.accountNumber !== undefined && {
            accountNumber: data.accountNumber,
          }),
          ...(data.accountName !== undefined && {
            accountName: data.accountName,
          }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
        },
      })
    })

    return jsonOk({ ...updated, createdAt: updated.createdAt.toISOString() })
  } catch (err) {
    console.error('[PATCH /api/bank-accounts/[id]] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }

  const { id } = await params

  try {
    const existing = await prisma.userBankAccount.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) return jsonError('Rekening tidak ditemukan', 404)

    await prisma.$transaction(async (tx) => {
      await tx.userBankAccount.delete({ where: { id } })
      // Kalau yang dihapus adalah default, promote rekening aktif lain
      // jadi default supaya selalu ada satu default.
      if (existing.isDefault) {
        const next = await tx.userBankAccount.findFirst({
          where: { userId: session.user.id, isActive: true },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        })
        if (next) {
          await tx.userBankAccount.update({
            where: { id: next.id },
            data: { isDefault: true },
          })
        }
      }
    })

    return jsonOk({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/bank-accounts/[id]] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
