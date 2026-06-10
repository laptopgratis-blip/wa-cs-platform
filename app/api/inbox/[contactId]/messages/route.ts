// GET /api/inbox/[contactId]/messages
// Ambil history pesan satu kontak (urut kronologis untuk tampilan chat).
// Default: halaman terbaru. Query param opsional ?cursor=<messageId> untuk
// load pesan yang lebih lama (pesan sebelum cursor tersebut).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ contactId: string }>
}

// Jumlah pesan per halaman. Query ambil +1 hanya untuk deteksi hasMore
// tanpa perlu query count terpisah.
const MESSAGES_PAGE_SIZE = 200

export async function GET(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const { contactId } = await params
  // Cursor opsional untuk pagination mundur (load pesan lebih lama).
  const cursor = new URL(req.url).searchParams.get('cursor')?.trim() || null
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId: session.user.id },
      select: {
        id: true,
        phoneNumber: true,
        name: true,
        avatar: true,
        tags: true,
        notes: true,
        pipelineStage: true,
        aiPaused: true,
        isResolved: true,
        lastMessageAt: true,
        waSession: { select: { id: true, displayName: true, status: true } },
      },
    })
    if (!contact) return jsonError('Kontak tidak ditemukan', 404)

    const isAdmin = session.user.role === 'ADMIN'
    // Ambil terbaru dulu (desc) supaya percakapan >200 pesan tetap menampilkan
    // pesan terakhir, lalu dibalik ke kronologis sebelum return — kontrak
    // response (array ascending) tidak berubah. Secondary sort by id supaya
    // urutan deterministik saat createdAt identik (penting untuk cursor).
    const page = await prisma.message.findMany({
      where: { contactId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MESSAGES_PAGE_SIZE + 1,
      // Cursor = id pesan tertua dari halaman sebelumnya; skip 1 supaya
      // pesan cursor itu sendiri tidak ikut terambil lagi.
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        content: true,
        role: true,
        status: true,
        source: true,
        createdAt: true,
        // Field cost di-include hanya untuk admin (data sensitif).
        ...(isAdmin
          ? {
              apiInputTokens: true,
              apiOutputTokens: true,
              apiCostRp: true,
              tokensCharged: true,
              revenueRp: true,
              profitRp: true,
              waSession: { select: { model: { select: { name: true } } } },
            }
          : {}),
      },
    })

    // Item ke-(PAGE_SIZE+1) cuma penanda masih ada pesan lebih lama.
    const hasMore = page.length > MESSAGES_PAGE_SIZE
    // slice() menghasilkan array baru, jadi reverse() di sini tidak
    // memutasi hasil query asli.
    const messages = page.slice(0, MESSAGES_PAGE_SIZE).reverse()
    // Cursor halaman berikutnya = pesan tertua di halaman ini.
    const nextCursor = hasMore ? (messages[0]?.id ?? null) : null

    return jsonOk({
      contact: {
        ...contact,
        lastMessageAt: contact.lastMessageAt?.toISOString() ?? null,
      },
      isAdmin,
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        role: m.role,
        status: m.status,
        source: m.source,
        createdAt: m.createdAt.toISOString(),
        ...(isAdmin
          ? {
              apiInputTokens: (m as { apiInputTokens?: number | null }).apiInputTokens ?? null,
              apiOutputTokens: (m as { apiOutputTokens?: number | null }).apiOutputTokens ?? null,
              apiCostRp: (m as { apiCostRp?: number | null }).apiCostRp ?? null,
              tokensCharged: (m as { tokensCharged?: number | null }).tokensCharged ?? null,
              revenueRp: (m as { revenueRp?: number | null }).revenueRp ?? null,
              profitRp: (m as { profitRp?: number | null }).profitRp ?? null,
              modelName: (m as { waSession?: { model?: { name: string } | null } | null }).waSession?.model?.name ?? null,
            }
          : {}),
      })),
      // Info pagination — field tambahan, aman karena frontend existing
      // hanya membaca contact/messages/isAdmin.
      hasMore,
      nextCursor,
    })
  } catch (err) {
    console.error('[GET /api/inbox/:id/messages] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
