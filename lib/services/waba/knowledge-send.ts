// Kirim satu lampiran knowledge (IMAGE/FILE) ke customer via Cloud API —
// dipanggil cs-pipeline (lewat callback di inbound.ts) setelah balasan teks
// AI terkirim. Paritas sendKnowledgeAttachments di wa-service/src/wa-manager.ts.
//
// Kontrak: TIDAK PERNAH throw (sendCloudText juga never-throw). Pesan error
// hanya untuk log server — tidak pernah ditampilkan ke customer/seller.

import path from 'node:path'

import type { KnowledgeAttachment } from '@/lib/services/cs-pipeline/attachments'

import {
  isKnowledgeMediaAvailable,
  loadKnowledgeMedia,
  planKnowledgeMedia,
} from './knowledge-media'
import { type CloudSendResult, sendCloudText } from './send'

// Upload dijalankan di bawah lock per-kontak (watchdog 120 dtk) — jangan
// pakai default 60-120 dtk uploadCloudMedia. File knowledge maks 10 MB.
const KNOWLEDGE_UPLOAD_TIMEOUT_MS = 20_000

function publicDir(): string {
  return path.join(process.cwd(), 'public')
}

/**
 * Lampiran ini bisa dikirim via Cloud? Dipakai SEBELUM generate AI supaya
 * prompt tidak menjanjikan file yang pasti gagal (tipe tak didukung, bukan
 * milik pemilik sesi, file hilang/kosong/terlalu besar).
 */
export function canSendKnowledgeAttachmentCloud(
  att: KnowledgeAttachment,
  ownerUserId: string,
): boolean {
  const plan = planKnowledgeMedia(att, ownerUserId)
  return plan !== null && isKnowledgeMediaAvailable(plan, publicDir())
}

export async function sendKnowledgeAttachmentCloud(input: {
  sessionId: string
  phoneNumber: string
  ownerUserId: string
  attachment: KnowledgeAttachment
}): Promise<CloudSendResult> {
  const { attachment } = input
  const plan = planKnowledgeMedia(attachment, input.ownerUserId)
  if (!plan) {
    return {
      success: false,
      error: `lampiran "${attachment.title}" tidak didukung Cloud API`,
    }
  }

  const media = await loadKnowledgeMedia(plan, publicDir())
  if (!media.ok) {
    return {
      success: false,
      error: `lampiran "${attachment.title}": ${media.error}`,
    }
  }

  const caption = attachment.caption?.trim() ?? ''
  return sendCloudText({
    sessionId: input.sessionId,
    phoneNumber: input.phoneNumber,
    content: caption,
    uploadTimeoutMs: KNOWLEDGE_UPLOAD_TIMEOUT_MS,
    ...(media.kind === 'image'
      ? { imageData: { buffer: media.buffer, mime: media.mime } }
      : {
          documentData: {
            buffer: media.buffer,
            mime: media.mime,
            filename: media.filename,
          },
        }),
  })
}
