// GET /api/admin/whatsapp-sessions?status=CONNECTED|...|all
//                                 &search=<nomor / email pemilik>
//                                 &page=1&pageSize=20
//
// Untuk admin panel /admin/whatsapp-sessions — list semua sesi WhatsApp lintas
// user (platform-wide). Read-only. Return row dgn pemilik (user), soul, model
// AI, plus hitung kontak & pesan supaya UI tidak perlu request tambahan.
//
// PENTING: pakai `select` (bukan `include`) supaya `sessionData` (kredensial
// Baileys terenkripsi) TIDAK pernah ikut terkirim ke client.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const VALID_STATUSES = [
  'DISCONNECTED',
  'CONNECTING',
  'WAITING_QR',
  'CONNECTED',
  'PAUSED',
  'ERROR',
] as const

export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const statusParam = url.searchParams.get('status') ?? 'all'
  const search = (url.searchParams.get('search') ?? '').trim()
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
  const pageSize = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? '20')),
  )

  const where: Record<string, unknown> = {}
  if (statusParam !== 'all') {
    if (!(VALID_STATUSES as readonly string[]).includes(statusParam)) {
      return jsonError(`Status tidak valid: ${statusParam}`)
    }
    where.status = statusParam
  }
  if (search) {
    where.OR = [
      { phoneNumber: { contains: search, mode: 'insensitive' } },
      { user: { email: { contains: search, mode: 'insensitive' } } },
    ]
  }

  try {
    const [rows, total] = await Promise.all([
      prisma.whatsappSession.findMany({
        where: where as never,
        select: {
          id: true,
          phoneNumber: true,
          displayName: true,
          status: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, email: true, name: true } },
          soul: { select: { id: true, name: true } },
          model: {
            select: {
              id: true,
              name: true,
              provider: true,
              costPerMessage: true,
            },
          },
          _count: { select: { contacts: true, messages: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.whatsappSession.count({ where: where as never }),
    ])

    return jsonOk({
      page,
      pageSize,
      total,
      sessions: rows.map((s) => ({
        id: s.id,
        phoneNumber: s.phoneNumber,
        displayName: s.displayName,
        status: s.status,
        isActive: s.isActive,
        user: s.user,
        soul: s.soul,
        model: s.model,
        contactsCount: s._count.contacts,
        messagesCount: s._count.messages,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/admin/whatsapp-sessions] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
