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

    const items = await retrieveRelevantKnowledge(wa.userId, message)

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
    const bankBlock = await formatBankAccountsForPrompt(wa.userId)
    const rulesBlock = defaultBehaviorRules()

    // Urutan: bank > knowledge > rules. Bank di atas supaya AI prioritas pakai
    // info ini saat customer minta transfer. Rules di paling bawah supaya
    // jadi guard rail terakhir setelah konteks.
    const promptBlock = [bankBlock, knowledgeBlock, rulesBlock]
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
