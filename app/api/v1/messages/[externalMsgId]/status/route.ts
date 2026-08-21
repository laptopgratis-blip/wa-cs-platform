// GET /api/v1/messages/[externalMsgId]/status — status kirim satu pesan.
//
// `externalMsgId` = wamid (Cloud API) atau msg.key.id (Baileys); kolomnya
// @unique, jadi klien bisa menyimpan id itu saat mengirim dan menanyakan
// statusnya belakangan tanpa perlu id internal kami.
import { apiV1Error, apiV1Ok, requirePublicApiAuth } from '@/lib/public-api-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ externalMsgId: string }>
}

export async function GET(req: Request, { params }: Params) {
  const gate = await requirePublicApiAuth(req)
  if (!gate.ok) return gate.response

  const { externalMsgId } = await params
  const wamid = decodeURIComponent(externalMsgId).trim()
  if (!wamid || wamid.length > 200) {
    return apiV1Error('invalid_query', 'externalMsgId tidak valid.', 400, gate.auth.rateLimitHeaders)
  }

  try {
    const msg = await prisma.message.findFirst({
      // Kepemilikan lewat relasi kontak — Message tidak punya userId.
      where: { externalMsgId: wamid, contact: { userId: gate.auth.userId } },
      select: {
        id: true,
        contactId: true,
        externalMsgId: true,
        status: true,
        role: true,
        source: true,
        createdAt: true,
        // Biaya Kredit Pesan yang benar-benar ditagih ke user ini (sudah
        // termasuk rekonsiliasi webhook pricing). Bukan margin platform.
        creditChargedRp: true,
        pricingCategory: true,
        billable: true,
      },
    })
    if (!msg) {
      return apiV1Error('not_found', 'Pesan tidak ditemukan.', 404, gate.auth.rateLimitHeaders)
    }

    return apiV1Ok({ ...msg, createdAt: msg.createdAt.toISOString() }, gate.auth)
  } catch (err) {
    console.error('[api/v1/messages/:id/status] gagal:', err)
    return apiV1Error('server_error', 'Gagal memuat status pesan.', 500, gate.auth.rateLimitHeaders)
  }
}
