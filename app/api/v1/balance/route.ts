// GET /api/v1/balance — dua dompet + tarif Kredit Pesan.
//
// Hulao punya DUA saldo yang sering tertukar:
// - token AI (`tokens`): 1 token = 1 balasan AI, dipotong per balasan.
// - Kredit Pesan WA (`messageCredit`, Rupiah): membayar pesan template Meta
//   di luar window 24 jam pada sesi Cloud API.
// Endpoint ini mengembalikan keduanya sekaligus supaya integrasi bisa memasang
// alarm saldo tipis tanpa menebak.
import { apiV1Error, apiV1Ok, requirePublicApiAuth } from '@/lib/public-api-auth'
import { prisma } from '@/lib/prisma'
import { getMessageCreditRates } from '@/lib/services/message-credits'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await requirePublicApiAuth(req)
  if (!gate.ok) return gate.response

  try {
    const [row, rates] = await Promise.all([
      prisma.tokenBalance.findUnique({
        where: { userId: gate.auth.userId },
        select: {
          balance: true,
          totalPurchased: true,
          totalUsed: true,
          messageCreditRp: true,
          messageCreditPurchased: true,
          messageCreditUsed: true,
        },
      }),
      getMessageCreditRates(),
    ])

    return apiV1Ok(
      {
        tokens: {
          balance: row?.balance ?? 0,
          totalPurchased: row?.totalPurchased ?? 0,
          totalUsed: row?.totalUsed ?? 0,
        },
        messageCredit: {
          balanceRp: row?.messageCreditRp ?? 0,
          totalPurchasedRp: row?.messageCreditPurchased ?? 0,
          totalUsedRp: row?.messageCreditUsed ?? 0,
          currency: 'IDR',
        },
        // Tarif berlaku saat ini per kategori template Meta.
        messageRatesRp: rates,
      },
      gate.auth,
    )
  } catch (err) {
    console.error('[api/v1/balance] gagal:', err)
    return apiV1Error('server_error', 'Gagal memuat saldo.', 500, gate.auth.rateLimitHeaders)
  }
}
