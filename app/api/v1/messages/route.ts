// GET  /api/v1/messages?contactId=&limit=&cursor= — riwayat pesan satu kontak.
// POST /api/v1/messages — kirim TEKS (Baileys / Cloud dalam window 24 jam).
//
// GET: `contactId` WAJIB — tanpa itu jadi dump seluruh riwayat. Model Message
// tak punya userId; kepemilikan lewat contactId → Contact.userId.
import {
  apiV1Error,
  apiV1Ok,
  checkSendRateLimit,
  completeIdempotent,
  parsePagination,
  readIdempotencyKey,
  releaseIdempotent,
  reserveIdempotent,
  requirePublicApiAuth,
} from '@/lib/public-api-auth'
import { prisma } from '@/lib/prisma'
import { sendPublicText } from '@/lib/services/public-api/send-message'
import { publicSendTextSchema } from '@/lib/validations/public-message'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await requirePublicApiAuth(req)
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const contactId = url.searchParams.get('contactId')?.trim()
  if (!contactId) {
    return apiV1Error(
      'invalid_query',
      'Parameter contactId wajib diisi.',
      400,
      gate.auth.rateLimitHeaders,
    )
  }

  const page = parsePagination(url)
  if (!page.ok)
    return apiV1Error(
      'invalid_query',
      page.error,
      400,
      gate.auth.rateLimitHeaders,
    )

  try {
    // Cek kepemilikan kontak dulu supaya id milik orang lain dijawab 404,
    // bukan daftar kosong yang membingungkan.
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId: gate.auth.userId },
      select: { id: true },
    })
    if (!contact) {
      return apiV1Error(
        'not_found',
        'Kontak tidak ditemukan.',
        404,
        gate.auth.rateLimitHeaders,
      )
    }

    // Cursor WAJIB divalidasi dalam scope yang sama (lihat komentar panjang di
    // app/api/v1/contacts/route.ts): anchor cursor Prisma tidak ikut memakai
    // klausa where, jadi cursor basi/asing menghilangkan baris diam-diam.
    if (page.cursor) {
      const anchor = await prisma.message.findFirst({
        where: {
          id: page.cursor,
          contactId,
          contact: { userId: gate.auth.userId },
        },
        select: { id: true },
      })
      if (!anchor) {
        return apiV1Error(
          'invalid_cursor',
          'Cursor tidak dikenal atau pesannya sudah dihapus. Ulangi dari halaman pertama.',
          400,
          gate.auth.rateLimitHeaders,
        )
      }
    }

    const rows = await prisma.message.findMany({
      where: { contactId, contact: { userId: gate.auth.userId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
      // Kolom margin platform (apiCostRp/revenueRp/profitRp/tokensCharged)
      // TIDAK boleh keluar.
      select: {
        id: true,
        contactId: true,
        content: true,
        role: true,
        status: true,
        source: true,
        externalMsgId: true,
        createdAt: true,
      },
    })

    const hasMore = rows.length > page.limit
    const items = hasMore ? rows.slice(0, page.limit) : rows

    return apiV1Ok(
      {
        items: items.map((m) => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
        })),
        nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      },
      gate.auth,
    )
  } catch (err) {
    console.error('[api/v1/messages] gagal:', err)
    return apiV1Error(
      'server_error',
      'Gagal memuat pesan.',
      500,
      gate.auth.rateLimitHeaders,
    )
  }
}

export async function POST(req: Request) {
  const gate = await requirePublicApiAuth(req)
  if (!gate.ok) return gate.response

  const sendLimited = checkSendRateLimit(gate.auth)
  if (sendLimited) return sendLimited

  const body = await req.json().catch(() => null)
  const parsed = publicSendTextSchema.safeParse(body)
  if (!parsed.success) {
    return apiV1Error(
      'invalid_body',
      parsed.error.issues[0]?.message ?? 'Data tidak valid.',
      400,
      gate.auth.rateLimitHeaders,
    )
  }

  // Reservasi idempotensi SESUDAH validasi, SEBELUM kerja async. Sinkron: dua
  // retry konkuren tidak sama-sama lolos → hanya satu yang mengirim.
  const idemKey = readIdempotencyKey(req)
  if (idemKey) {
    const r = reserveIdempotent(gate.auth.keyId, idemKey)
    if (r.kind === 'done') return apiV1Ok(r.body, gate.auth, r.status)
    if (r.kind === 'pending') {
      return apiV1Error(
        'idempotency_in_progress',
        'Request dengan Idempotency-Key ini sedang diproses.',
        409,
        gate.auth.rateLimitHeaders,
      )
    }
  }

  try {
    const out = await sendPublicText({
      userId: gate.auth.userId,
      to: parsed.data.phone_number,
      content: parsed.data.content,
      sessionId: parsed.data.session_id ?? undefined,
      strictSession: parsed.data.strict_session,
    })
    if (!out.ok) {
      // Hanya cache SUKSES — lepas reservasi supaya retry boleh jalan.
      if (idemKey) releaseIdempotent(gate.auth.keyId, idemKey)
      return apiV1Error(
        out.code ?? 'send_failed',
        out.error ?? 'Gagal mengirim.',
        out.httpStatus,
        gate.auth.rateLimitHeaders,
      )
    }
    if (idemKey) completeIdempotent(gate.auth.keyId, idemKey, 200, out.data)
    return apiV1Ok(out.data, gate.auth)
  } catch (err) {
    if (idemKey) releaseIdempotent(gate.auth.keyId, idemKey)
    console.error('[api/v1/messages POST] gagal:', err)
    return apiV1Error(
      'server_error',
      'Gagal mengirim pesan.',
      500,
      gate.auth.rateLimitHeaders,
    )
  }
}
