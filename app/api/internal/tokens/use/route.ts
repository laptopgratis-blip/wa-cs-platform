// POST /api/internal/tokens/use
// Potong token user. Atomic — kalau saldo kurang, response 402 dan tidak
// memotong apapun. Sukses → return saldo baru.
import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().positive(),
  description: z.string().max(200).optional(),
  // Pesan / sesi terkait — disimpan ke TokenTransaction.reference.
  reference: z.string().max(100).optional(),
})

export async function POST(req: Request) {
  const blocked = requireServiceSecret(req)
  if (blocked) return blocked

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 400 },
    )
  }

  try {
    // Atomic: pakai transaksi DB dengan kondisi balance >= amount.
    const result = await prisma.$transaction(async (tx) => {
      // updateMany dengan where balance >= amount → count 0 kalau saldo kurang.
      const updated = await tx.tokenBalance.updateMany({
        where: { userId: body.userId, balance: { gte: body.amount } },
        data: {
          balance: { decrement: body.amount },
          totalUsed: { increment: body.amount },
        },
      })
      if (updated.count === 0) return { ok: false as const }

      // TokenTransaction punya unique constraint (userId, reference, type)
      // untuk idempotency webhook PURCHASE. Untuk USAGE charge AI reply,
      // caller (wa-service) kirim reference=sessionId yang berulang per
      // session — append UUID supaya tetap unique tapi sessionId masih
      // bisa di-grep di prefix untuk audit.
      const usageReference = body.reference
        ? `${body.reference}:${randomUUID()}`
        : undefined
      await tx.tokenTransaction.create({
        data: {
          userId: body.userId,
          amount: -body.amount,
          type: 'USAGE',
          description: body.description ?? 'AI reply',
          reference: usageReference,
        },
      })
      const balance = await tx.tokenBalance.findUnique({
        where: { userId: body.userId },
        select: { balance: true },
      })
      return { ok: true as const, balance: balance?.balance ?? 0 }
    })

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: 'token tidak cukup' },
        { status: 402 },
      )
    }

    return NextResponse.json({
      success: true,
      data: { userId: body.userId, balance: result.balance, used: body.amount },
    })
  } catch (err) {
    console.error('[POST /api/internal/tokens/use] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
