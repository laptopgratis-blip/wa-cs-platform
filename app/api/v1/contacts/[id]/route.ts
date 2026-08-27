// GET /api/v1/contacts/[id] — detail satu kontak.
//
// Kontak milik user lain dijawab 404, BUKAN 403: 403 memberi tahu penyerang
// bahwa id itu ada dan milik orang lain.
import { apiV1Error, apiV1Ok, requirePublicApiAuth } from '@/lib/public-api-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: Params) {
  const gate = await requirePublicApiAuth(req)
  if (!gate.ok) return gate.response

  const { id } = await params
  try {
    const contact = await prisma.contact.findFirst({
      // Filter userId WAJIB ikut di query, bukan dicek setelahnya.
      where: { id, userId: gate.auth.userId },
      select: {
        id: true,
        phoneNumber: true,
        name: true,
        tags: true,
        pipelineStage: true,
        isBlacklisted: true,
        isResolved: true,
        lastMessageAt: true,
        createdAt: true,
        waSessionId: true,
        _count: { select: { messages: true } },
      },
    })
    if (!contact) {
      return apiV1Error('not_found', 'Kontak tidak ditemukan.', 404, gate.auth.rateLimitHeaders)
    }

    const { _count, ...rest } = contact
    return apiV1Ok(
      {
        ...rest,
        messageCount: _count.messages,
        lastMessageAt: contact.lastMessageAt?.toISOString() ?? null,
        createdAt: contact.createdAt.toISOString(),
      },
      gate.auth,
    )
  } catch (err) {
    console.error('[api/v1/contacts/:id] gagal:', err)
    return apiV1Error('server_error', 'Gagal memuat kontak.', 500, gate.auth.rateLimitHeaders)
  }
}
