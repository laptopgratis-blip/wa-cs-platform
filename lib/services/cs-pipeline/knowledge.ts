// Knowledge augmentation untuk balasan CS AI: kumpulkan konteks (waktu, bank,
// katalog, knowledge match, ongkir, rules) jadi satu promptBlock + daftar
// attachment yang dikirim otomatis setelah balasan teks.
// Diekstrak dari app/api/internal/knowledge/[sessionId]/route.ts.

import { prisma } from '@/lib/prisma'
import {
  formatCurrentTimeForPrompt,
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

import {
  type KnowledgeAttachment,
  selectKnowledgeAttachments,
} from './attachments'

export type { KnowledgeAttachment } from './attachments'

export interface KnowledgeForMessage {
  items: Awaited<ReturnType<typeof retrieveRelevantKnowledge>>
  promptBlock: string
  attachments: KnowledgeAttachment[]
}

export interface KnowledgeForMessageOptions {
  /**
   * Bisa transport sesi ini mengirim lampiran tsb? Tanpa opsi → semua
   * IMAGE/FILE dianggap terkirim (wa-service Baileys). Lampiran yang ditolak
   * tidak dikembalikan DAN tidak dijanjikan di prompt.
   */
  canSendAttachment?: (att: KnowledgeAttachment) => boolean
}

export async function getKnowledgeForMessage(
  userId: string,
  message: string,
  opts?: KnowledgeForMessageOptions,
): Promise<KnowledgeForMessage> {
  // Setting integrasi CS AI (katalog produk, hitung ongkir) + knowledge
  // dalam satu batch paralel supaya tidak menambah RTT serial.
  const integration = await prisma.csAiIntegration.findUnique({
    where: { userId },
  })

  const [items, bankBlock, productBlock, shippingInstrBlock, shippingResolved] =
    await Promise.all([
      retrieveRelevantKnowledge(userId, message),
      formatBankAccountsForPrompt(userId),
      integration?.productCatalogEnabled
        ? formatProductCatalogForPrompt(userId, {
            applyFlashSale: integration.applyFlashSaleDiscount,
          })
        : Promise.resolve(''),
      integration?.shippingCalcEnabled
        ? formatShippingInstructionForPrompt(userId, {
            applySubsidyRules: integration.applySubsidyRules,
          })
        : Promise.resolve(''),
      integration?.shippingCalcEnabled && message
        ? resolveShippingFromMessage(userId, message, {
            applySubsidyRules: integration.applySubsidyRules,
          })
        : Promise.resolve(null),
    ])

  // Attachments: knowledge IMAGE/FILE yang match DAN bisa dikirim transport
  // sesi → dikirim otomatis setelah balasan teks AI.
  const attachments = selectKnowledgeAttachments(items, opts?.canSendAttachment)

  const knowledgeBlock = formatKnowledgeForPrompt(items, {
    attachableIds: new Set(attachments.map((a) => a.id)),
  })
  const rulesBlock = defaultBehaviorRules({
    hasAttachments: attachments.length > 0,
  })

  // Urutan: waktu sekarang > bank > katalog produk > knowledge user >
  // ongkir (instruksi + resolved kalau ada) > rules. Waktu paling atas
  // karena jadi acuan semua batas promo; bank di atas karena pertanyaan
  // transfer sering muncul; produk & ongkir konteks domain spesifik;
  // rules di paling bawah sebagai guard rail terakhir.
  const promptBlock = [
    formatCurrentTimeForPrompt(),
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

  return { items, promptBlock, attachments }
}
