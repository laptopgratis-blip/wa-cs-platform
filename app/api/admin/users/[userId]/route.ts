// PATCH  /api/admin/users/[userId] — edit nama, role, atau saldo token
// DELETE /api/admin/users/[userId] — hapus user + semua data terkait
//
// Aturan keamanan:
// - Admin tidak boleh ubah role / hapus dirinya sendiri.
// - Admin tidak boleh menurunkan/menghapus admin terakhir (cegah lockout
//   total dari panel admin).
// - tokenBalance di PATCH = saldo ABSOLUT (set), beda dengan endpoint topup
//   yang increment. Selisihnya dicatat sebagai TokenTransaction tipe
//   ADJUSTMENT supaya audit trail tetap utuh.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { userUpdateSchema } from '@/lib/validations/admin'

interface Params {
  params: Promise<{ userId: string }>
}

export async function PATCH(req: Request, { params }: Params) {
  let admin
  try {
    admin = await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { userId } = await params
  const parsed = userUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  const { name, role, tokenBalance } = parsed.data

  if (name === undefined && role === undefined && tokenBalance === undefined) {
    return jsonError('Tidak ada perubahan')
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    })
    if (!target) return jsonError('User tidak ditemukan', 404)

    // Tidak boleh ubah role diri sendiri (cegah self-demote yang bikin
    // bingung; admin boleh ubah field lain dari dirinya).
    if (role !== undefined && admin.user.id === userId) {
      return jsonError('Tidak bisa mengubah role diri sendiri', 403)
    }

    // Cek "admin terakhir": kalau target adalah ADMIN dan diubah jadi USER,
    // pastikan masih ada admin lain.
    if (role === 'USER' && target.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
      if (adminCount <= 1) {
        return jsonError(
          'Tidak bisa menurunkan admin terakhir — minimal harus ada satu admin',
          409,
        )
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Update field user (name, role)
      const userPatch: { name?: string | null; role?: 'USER' | 'ADMIN' } = {}
      if (name !== undefined) userPatch.name = name
      if (role !== undefined) userPatch.role = role
      if (Object.keys(userPatch).length > 0) {
        await tx.user.update({ where: { id: userId }, data: userPatch })
      }

      // Set saldo token (absolut). Hitung selisih untuk audit trail.
      if (tokenBalance !== undefined) {
        const current = await tx.tokenBalance.findUnique({ where: { userId } })
        const oldBalance = current?.balance ?? 0
        const delta = tokenBalance - oldBalance

        await tx.tokenBalance.upsert({
          where: { userId },
          create: {
            userId,
            balance: tokenBalance,
            // Saldo awal hasil set absolut tidak murni "purchased" — biarkan
            // 0 supaya laporan total beli tetap akurat.
            totalPurchased: 0,
          },
          update: { balance: tokenBalance },
        })

        if (delta !== 0) {
          await tx.tokenTransaction.create({
            data: {
              userId,
              amount: delta,
              type: 'ADJUSTMENT',
              description: `Saldo di-set manual oleh admin (${
                admin.user.email ?? admin.user.id
              }) dari ${oldBalance} ke ${tokenBalance}`,
            },
          })
        }
      }

      return tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          tokenBalance: { select: { balance: true } },
        },
      })
    })

    return jsonOk(updated)
  } catch (err) {
    console.error(
      '[PATCH /api/admin/users/:id] gagal:',
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : err,
    )
    return jsonError(
      err instanceof Error ? `Server error: ${err.message}` : 'Terjadi kesalahan server',
      500,
    )
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  let admin
  try {
    admin = await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { userId } = await params

  if (admin.user.id === userId) {
    return jsonError('Tidak bisa menghapus diri sendiri', 403)
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    })
    if (!target) return jsonError('User tidak ditemukan', 404)

    if (target.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
      if (adminCount <= 1) {
        return jsonError(
          'Tidak bisa menghapus admin terakhir — minimal harus ada satu admin',
          409,
        )
      }
    }

    // Cascade manual di transaction. Banyak relasi sudah punya
    // onDelete:Cascade (lihat schema.prisma), tapi Contact.waSession TIDAK
    // cascade — jadi urutannya penting: hapus Message → Contact → Broadcast
    // → WhatsappSession → Soul, baru User. Sisanya (TokenBalance,
    // TokenTransaction, Account, Session, ManualPayment, dst.) ikut cascade
    // lewat FK schema saat User dihapus.
    await prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({
        where: { waSession: { userId } },
      })
      await tx.contact.deleteMany({ where: { userId } })
      await tx.broadcast.deleteMany({ where: { userId } })
      await tx.whatsappSession.deleteMany({ where: { userId } })
      await tx.soul.deleteMany({ where: { userId } })
      await tx.user.delete({ where: { id: userId } })
    })

    return jsonOk({ deleted: true, email: target.email })
  } catch (err) {
    console.error(
      '[DELETE /api/admin/users/:id] gagal:',
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : err,
    )
    return jsonError(
      err instanceof Error ? `Server error: ${err.message}` : 'Terjadi kesalahan server',
      500,
    )
  }
}
