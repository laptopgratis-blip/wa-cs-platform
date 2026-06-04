// POST /api/internal/knowledge/[sessionId]
// Dipanggil wa-service tiap pesan masuk untuk dapat knowledge entries yang
// match keyword di pesan customer. Body: { message: string }.
//
// Response sekarang juga include:
//   - bank account block (kalau user punya UserBankAccount aktif) — supaya AI
//     bisa langsung kasih nomor rekening tanpa minta admin
//   - behavior rules — anti-escalate, auto-close, proactive asset send
//   - attachments[] — items knowledge dengan fileUrl IMAGE/FILE yang akan
//     dikirim wa-manager OTOMATIS setelah balasan teks AI (tidak butuh AI
//     "request" attachment)
//
// Side-effect: kalau ada match, increment triggerCount + lastTriggeredAt
// supaya counter di UI dashboard up-to-date.
import { NextResponse } from 'next/server'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'
import {
  formatProductCatalogForPrompt,
  formatShippingInstructionForPrompt,
  resolveShippingFromMessage,
} from '@/lib/services/cs-ai-context'
import {
  defaultBehaviorRules,
  formatBankAccountsForPrompt,
  formatKnowledgeForPrompt,
  incrementTriggerCount,
  retrieveRelevantKnowledge,
} from '@/lib/services/knowledge-retriever'

interface Params {
  params: Promise<{ sessionId: string }>
}

export async function POST(req: Request, { params }: Params) {
  const blocked = requireServiceSecret(req)
  if (blocked) return blocked

  const { sessionId } = await params

  const body = (await req.json().catch(() => null)) as
    | { message?: unknown }
    | null
  const message =
    body && typeof body.message === 'string' ? body.message : ''

  try {
    // Resolve userId dari sessionId — wa-service hanya tahu sessionId.
    const wa = await prisma.whatsappSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    })
    if (!wa) {
      return NextResponse.json(
        { success: false, error: 'session tidak ditemukan' },
        { status: 404 },
      )
    }

    // Ambil setting integrasi CS AI (katalog produk, hitung ongkir) +
    // knowledge dalam satu paralel batch supaya tidak nambah RTT serial.
    const integration = await prisma.csAiIntegration.findUnique({
      where: { userId: wa.userId },
    })

    const [items, bankBlock, productBlock, shippingInstrBlock, shippingResolved] =
      await Promise.all([
        retrieveRelevantKnowledge(wa.userId, message),
        formatBankAccountsForPrompt(wa.userId),
        integration?.productCatalogEnabled
          ? formatProductCatalogForPrompt(wa.userId, {
              applyFlashSale: integration.applyFlashSaleDiscount,
            })
          : Promise.resolve(''),
        integration?.shippingCalcEnabled
          ? formatShippingInstructionForPrompt(wa.userId, {
              applySubsidyRules: integration.applySubsidyRules,
            })
          : Promise.resolve(''),
        integration?.shippingCalcEnabled && message
          ? resolveShippingFromMessage(wa.userId, message, {
              applySubsidyRules: integration.applySubsidyRules,
            })
          : Promise.resolve(null),
      ])

    // Kumpulkan attachments: knowledge IMAGE/FILE yang match → wa-manager
    // akan kirim otomatis setelah balasan teks AI.
    const attachments = items
      .filter(
        (it) =>
          !!it.fileUrl &&
          (it.contentType === 'IMAGE' || it.contentType === 'FILE'),
      )
      .map((it) => ({
        fileUrl: it.fileUrl as string,
        title: it.title,
        caption: it.caption,
        contentType: it.contentType,
      }))

    const knowledgeBlock = formatKnowledgeForPrompt(items)
    const rulesBlock = defaultBehaviorRules()

    // Urutan: bank > katalog produk > knowledge user > ongkir (instruksi +
    // resolved kalau ada) > rules. Bank di atas karena pertanyaan transfer
    // sering muncul; produk & ongkir konteks domain spesifik; rules di paling
    // bawah sebagai guard rail terakhir.
    const promptBlock = [
      bankBlock,
      productBlock,
      knowledgeBlock,
      shippingInstrBlock,
      shippingResolved ?? '',
      rulesBlock,
    ]
      .filter((s) => s.trim().length > 0)
      .join('\n')

    // Best-effort increment — tidak menahan response.
    if (items.length > 0) {
      void incrementTriggerCount(items.map((it) => it.id))
    }

    return NextResponse.json({
      success: true,
      data: { items, promptBlock, attachments },
    })
  } catch (err) {
    console.error('[POST /api/internal/knowledge/:sessionId] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
