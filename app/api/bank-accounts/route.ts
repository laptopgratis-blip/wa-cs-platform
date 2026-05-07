// GET  /api/bank-accounts — list rekening user.
// POST /api/bank-accounts — buat rekening baru. Limit 5 per user.
//
// Plan-gate: hanya user dengan akses Order System (paket POWER) yang boleh
// akses endpoint ini.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import {
  BANK_ACCOUNT_LIMIT_PER_USER,
  bankAccountCreateSchema,
} from '@/lib/validations/bank-account'

export async function GET() {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }

  try {
    const items = await prisma.userBankAccount.findMany({
      where: { userId: session.user.id },
      orderBy: [
        { isDefault: 'desc' },
        { order: 'asc' },
        { createdAt: 'asc' },
      ],
    })
    return jsonOk({
      items: items.map((it) => ({
        ...it,
        createdAt: it.createdAt.toISOString(),
      })),
      limit: BANK_ACCOUNT_LIMIT_PER_USER,
      used: items.length,
    })
  } catch (err) {
    console.error('[GET /api/bank-accounts] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }

  const json = await req.json().catch(() => null)
  const parsed = bankAccountCreateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    const count = await prisma.userBankAccount.count({
      where: { userId: session.user.id },
    })
    if (count >= BANK_ACCOUNT_LIMIT_PER_USER) {
      return jsonError(
        `Sudah mencapai batas ${BANK_ACCOUNT_LIMIT_PER_USER} rekening. Hapus salah satu untuk menambah baru.`,
        409,
      )
    }

    const data = parsed.data

    // Kalau ini rekening pertama atau user explicitly minta jadi default,
    // pastikan hanya 1 yang default. Pakai transaction supaya konsisten.
    const created = await prisma.$transaction(async (tx) => {
      const wantsDefault = data.isDefault === true || count === 0
      if (wantsDefault) {
        await tx.userBankAccount.updateMany({
          where: { userId: session.user.id, isDefault: true },
          data: { isDefault: false },
        })
      }
      return tx.userBankAccount.create({
        data: {
          userId: session.user.id,
          bankName: data.bankName,
          accountNumber: data.accountNumber,
          accountName: data.accountName,
          isActive: data.isActive ?? true,
          isDefault: wantsDefault,
          order: count,
        },
      })
    })

    return jsonOk(
      { ...created, createdAt: created.createdAt.toISOString() },
      201,
    )
  } catch (err) {
    console.error('[POST /api/bank-accounts] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
