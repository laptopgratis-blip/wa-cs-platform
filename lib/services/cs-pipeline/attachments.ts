// Pilih lampiran knowledge (IMAGE/FILE) yang ikut dikirim setelah balasan
// teks AI. Pure — tanpa prisma — supaya bisa diuji langsung.

import type { RetrievedKnowledge } from '@/lib/services/knowledge-retriever'

export interface KnowledgeAttachment {
  id: string
  fileUrl: string
  title: string
  caption: string | null
  contentType: string
}

/**
 * Lampiran dari knowledge yang match. `canSend` (opsional) menyaring yang
 * tidak bisa dikirim transport sesi — tanpa predicate semua IMAGE/FILE
 * ber-fileUrl lolos.
 */
export function selectKnowledgeAttachments(
  items: RetrievedKnowledge[],
  canSend?: (att: KnowledgeAttachment) => boolean,
): KnowledgeAttachment[] {
  return items
    .filter(
      (it) =>
        !!it.fileUrl &&
        (it.contentType === 'IMAGE' || it.contentType === 'FILE'),
    )
    .map((it) => ({
      id: it.id,
      fileUrl: it.fileUrl as string,
      title: it.title,
      caption: it.caption,
      contentType: it.contentType,
    }))
    .filter((att) => !canSend || canSend(att))
}

export interface AttachmentSendOutcome {
  ok: boolean
  externalMsgId: string | null
  error?: string
}

export interface AttachmentSendReport {
  sent: KnowledgeAttachment[]
  failed: Array<{ attachment: KnowledgeAttachment; error: string }>
  /** Tidak dikirim karena melewati cap jumlah / anggaran waktu. */
  skipped: KnowledgeAttachment[]
}

// Paritas wa-manager sendKnowledgeAttachments: cap supaya tidak spam.
export const MAX_ATTACHMENTS_PER_REPLY = 3

/**
 * Kirim lampiran berurutan dalam anggaran waktu. Dipanggil di bawah lock
 * per-kontak (pipeline-lock watchdog 120 dtk) — setelah anggaran habis,
 * lampiran berikutnya TIDAK dimulai supaya lock tidak direbut & customer
 * tidak dapat balasan ganda. Satu gagal/throw tidak menghentikan sisanya.
 * NEVER throw.
 */
export async function sendAttachmentsWithinBudget(input: {
  attachments: KnowledgeAttachment[]
  send: (att: KnowledgeAttachment) => Promise<AttachmentSendOutcome>
  budgetMs: number
  maxCount?: number
  now?: () => number
}): Promise<AttachmentSendReport> {
  const now = input.now ?? Date.now
  const maxCount = input.maxCount ?? MAX_ATTACHMENTS_PER_REPLY
  const startedAt = now()
  const report: AttachmentSendReport = { sent: [], failed: [], skipped: [] }

  for (const att of input.attachments.slice(0, maxCount)) {
    if (now() - startedAt >= input.budgetMs) {
      report.skipped.push(att)
      continue
    }
    try {
      const res = await input.send(att)
      if (res.ok) report.sent.push(att)
      else
        report.failed.push({
          attachment: att,
          error: res.error ?? 'tanpa detail',
        })
    } catch (err) {
      report.failed.push({ attachment: att, error: (err as Error).message })
    }
  }
  report.skipped.push(...input.attachments.slice(maxCount))
  return report
}
