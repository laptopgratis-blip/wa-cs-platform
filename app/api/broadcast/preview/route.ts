// GET /api/broadcast/preview?waSessionId=...&tags=a,b&stages=NEW,PROSPECT[&templateId=]
// Hitung jumlah kontak yang akan menerima broadcast — dipakai form untuk
// preview "Akan dikirim ke X kontak". Dengan templateId (Cloud API): juga
// jumlah opt-out yang dikecualikan (MARKETING), estimasi kredit, saldo.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { MESSAGE_CREDIT_BILLING_ENABLED } from '@/lib/billing/message-credit-mode'
import { buildTargetWhere } from '@/lib/broadcast'
import { prisma } from '@/lib/prisma'
import { getMessageCreditBalance, getMessageCreditRates } from '@/lib/services/message-credits'

const VALID_STAGES = [
  'NEW',
  'PROSPECT',
  'INTEREST',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
] as const

type Stage = (typeof VALID_STAGES)[number]

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const waSessionId = url.searchParams.get('waSessionId')
  if (!waSessionId) return jsonError('waSessionId wajib')
  const templateId = url.searchParams.get('templateId')

  const tags = (url.searchParams.get('tags') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const stages = (url.searchParams.get('stages') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is Stage => (VALID_STAGES as readonly string[]).includes(s))

  try {
    const wa = await prisma.whatsappSession.findFirst({
      where: { id: waSessionId, userId: session.user.id },
      select: { id: true },
    })
    if (!wa) return jsonError('WhatsApp session tidak ditemukan', 404)

    if (tags.length === 0 && stages.length === 0) {
      return jsonOk({ count: 0, excludedOptOut: 0, estimatedCreditRp: 0, balanceRp: null })
    }

    const template = templateId
      ? await prisma.wabaTemplate.findFirst({
          where: { id: templateId, userId: session.user.id },
          select: { category: true },
        })
      : null
    const isMarketing = template?.category === 'MARKETING'

    const baseWhere = { userId: session.user.id, waSessionId, tags, stages }
    const [count, countAll] = await Promise.all([
      prisma.contact.count({
        where: buildTargetWhere({ ...baseWhere, excludeMarketingOptOut: isMarketing }) as never,
      }),
      isMarketing ? prisma.contact.count({ where: buildTargetWhere(baseWhere) as never }) : Promise.resolve(0),
    ])

    let estimatedCreditRp = 0
    let balanceRp: number | null = null
    // balanceRp null = UI menyembunyikan baris estimasi/saldo sepenuhnya.
    if (template && MESSAGE_CREDIT_BILLING_ENABLED) {
      const rates = await getMessageCreditRates()
      estimatedCreditRp = count * rates[template.category]
      balanceRp = await getMessageCreditBalance(session.user.id)
    }

    return jsonOk({
      count,
      excludedOptOut: isMarketing ? Math.max(0, countAll - count) : 0,
      estimatedCreditRp,
      balanceRp,
    })
  } catch (err) {
    console.error('[GET /api/broadcast/preview] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
