// Pesan masuk WhatsApp Cloud API → pipeline CS (simpan + AI reply).
// Paritas perilaku dengan jalur Baileys (wa-manager handleIncomingMessage):
//   - teks / caption media → pipeline AI penuh
//   - media tanpa caption → simpan placeholder saja, TIDAK memicu AI
//   - reaction / tipe tak dikenal → di-skip
// Dedup: wamid dicek terhadap Message.externalMsgId (tahan webhook retry).

import { prisma } from '@/lib/prisma'
import { runCsPipeline } from '@/lib/services/cs-pipeline'
import {
  isDuplicateExternalMessageError,
  saveMessage,
} from '@/lib/services/cs-pipeline/message-store'

import { withContactLock } from './pipeline-lock'
import { relayEmit } from './realtime'
import { sendCloudText } from './send'
import type { WabaChangeValue, WabaInboundMessage } from './types'

export async function handleInboundMessages(
  phoneNumberId: string,
  value: WabaChangeValue,
): Promise<void> {
  const session = await prisma.whatsappSession.findUnique({
    where: { phoneNumberId },
    select: { id: true, status: true, isActive: true, provider: true },
  })
  // Sesi tidak dikenal / sudah diputus lokal → abaikan (Meta tetap mengirim
  // webhook sampai unsubscribe). Tetap log supaya salah-routing terlihat.
  if (!session || session.provider !== 'CLOUD_API' || !session.isActive) {
    console.log(
      `[waba/inbound] event untuk phone_number_id=${phoneNumberId} diabaikan (sesi tidak dikenal/nonaktif)`,
    )
    return
  }
  // Terima pesan ke inbox selama sesi aktif dan bukan DISCONNECTED (user
  // sengaja memutus). PAUSED (token habis) dan ERROR (mis. register gagal /
  // token perlu refresh) TETAP menerima — kalau webhook masih mengirim, berarti
  // Meta menganggap nomor hidup; membuang pesan customer di sini membuat sesi
  // 'mati total tanpa jalur pulih'. AI reply digate terpisah oleh pipeline
  // (pre-flight token, soul/model). Paritas kirimchat: inbound tidak pernah
  // digate status koneksi.
  if (session.status === 'DISCONNECTED') {
    console.log(`[waba/inbound] sesi ${session.id} DISCONNECTED — pesan diabaikan`)
    return
  }

  for (const message of value.messages ?? []) {
    try {
      await processOne(session.id, message, value)
    } catch (err) {
      if (isDuplicateExternalMessageError(err)) {
        console.log(`[waba/inbound] duplikat wamid=${message.id} (race) — di-skip`)
        continue
      }
      console.error(`[waba/inbound] gagal proses wamid=${message.id}:`, err)
    }
  }
}

async function processOne(
  sessionId: string,
  message: WabaInboundMessage,
  value: WabaChangeValue,
): Promise<void> {
  const waId = message.from?.replace(/\D/g, '') ?? ''
  if (!waId || !message.id) return

  // Dedup lintas proses: wamid sudah pernah disimpan → webhook retry, skip.
  // (externalMsgId unique; race yang lolos cek ini ditangkap sebagai
  // DuplicateExternalMessageError di bawah.)
  const existing = await prisma.message.findUnique({
    where: { externalMsgId: message.id },
    select: { id: true },
  })
  if (existing) {
    console.log(`[waba/inbound] duplikat wamid=${message.id} — di-skip`)
    return
  }

  const pushName =
    value.contacts?.find((c) => c.wa_id === message.from)?.profile?.name ?? null

  const extracted = extractInboundContent(message)
  if (!extracted) return // reaction / tipe tak didukung — paritas Baileys

  const emitSaved = (info: {
    contactId: string
    messageId: string | null
    content: string
    role: 'USER' | 'AI'
    status: 'SENT' | 'FAILED'
    source: string | null
  }) => {
    void relayEmit('inbox:message', {
      sessionId,
      contactId: info.contactId,
      phoneNumber: waId,
      name: pushName,
      message: {
        id: info.messageId,
        content: info.content,
        role: info.role,
        status: info.status,
        source: info.source,
        createdAt: new Date().toISOString(),
      },
    })
  }

  // Media tanpa caption → simpan placeholder, emit, TIDAK memicu AI.
  if (extracted.kind === 'placeholder') {
    const saved = await saveMessage({
      sessionId,
      phoneNumber: waId,
      pushName,
      content: extracted.content,
      role: 'USER',
      externalMsgId: message.id,
      touchWindow: true,
    })
    if (saved) {
      emitSaved({
        contactId: saved.contactId,
        messageId: saved.messageId,
        content: extracted.content,
        role: 'USER',
        status: 'SENT',
        source: null,
      })
    }
    return
  }

  // Teks → pipeline penuh di bawah lock per kontak (anti double-reply +
  // drain burst pesan beruntun).
  await withContactLock({
    sessionId,
    waId,
    content: extracted.content,
    externalId: message.id,
    savePending: async (content, externalId) => {
      const saved = await saveMessage({
        sessionId,
        phoneNumber: waId,
        pushName,
        content,
        role: 'USER',
        externalMsgId: externalId,
        touchWindow: true,
      })
      if (saved) {
        emitSaved({
          contactId: saved.contactId,
          messageId: saved.messageId,
          content,
          role: 'USER',
          status: 'SENT',
          source: null,
        })
      }
    },
    run: async (content, opts) => {
      const result = await runCsPipeline({
        sessionId,
        phoneNumber: waId,
        pushName,
        content,
        inboundExternalId: opts.externalId,
        skipSave: opts.skipSave,
        touchWindow: true,
        send: async (text) => {
          const res = await sendCloudText({ sessionId, phoneNumber: waId, content: text })
          return {
            ok: res.success,
            externalMsgId: res.data?.messageId ?? null,
            error: res.error,
          }
        },
        sendToPhone: async (phoneNumber, text) => {
          const res = await sendCloudText({ sessionId, phoneNumber, content: text })
          return {
            ok: res.success,
            externalMsgId: res.data?.messageId ?? null,
            error: res.error,
          }
        },
        onSaved: (info) =>
          emitSaved({
            contactId: info.contactId,
            messageId: info.messageId,
            content: info.content,
            role: info.role,
            status: info.status,
            source: info.source,
          }),
      })
      if (result.outcome !== 'replied' && result.outcome !== 'flow_replied') {
        console.log(
          `[waba/inbound] pipeline ${sessionId} wamid=${message.id} outcome=${result.outcome}${result.detail ? ` (${result.detail})` : ''}`,
        )
      }
      return { shouldContinue: result.shouldContinue }
    },
  })
}

// ── Ekstraksi konten per tipe pesan (paritas extractText +
// extractMediaPlaceholder di wa-manager) ──

export interface ExtractedContent {
  kind: 'text' | 'placeholder'
  content: string
}

export function extractInboundContent(message: WabaInboundMessage): ExtractedContent | null {
  switch (message.type) {
    case 'text': {
      const body = message.text?.body?.trim()
      return body ? { kind: 'text', content: body } : null
    }
    case 'interactive': {
      const title =
        message.interactive?.button_reply?.title ??
        message.interactive?.list_reply?.title
      return title ? { kind: 'text', content: title } : null
    }
    case 'button': {
      const text = message.button?.text ?? message.button?.payload
      return text ? { kind: 'text', content: text } : null
    }
    case 'image':
      return withCaption(message.image?.caption, '[Gambar]')
    case 'video':
      return withCaption(message.video?.caption, '[Video]')
    case 'document':
      return withCaption(
        message.document?.caption,
        message.document?.filename ? `[Dokumen: ${message.document.filename}]` : '[Dokumen]',
      )
    case 'audio':
      return { kind: 'placeholder', content: message.audio?.voice ? '[Voice note]' : '[Audio]' }
    case 'sticker':
      return { kind: 'placeholder', content: '[Stiker]' }
    case 'location': {
      const loc = message.location
      const label = loc?.name || loc?.address || `${loc?.latitude ?? '?'},${loc?.longitude ?? '?'}`
      return { kind: 'placeholder', content: `[Lokasi: ${label}]` }
    }
    case 'contacts': {
      const name = message.contacts?.[0]?.name?.formatted_name
      return { kind: 'placeholder', content: name ? `[Kontak: ${name}]` : '[Kontak]' }
    }
    case 'reaction':
      return null // paritas Baileys: reaction di-skip
    default:
      return null
  }
}

// Media ber-caption diperlakukan sebagai teks (caption memicu AI) — paritas
// extractText Baileys yang membaca imageMessage.caption / videoMessage.caption.
function withCaption(caption: string | undefined, placeholder: string): ExtractedContent {
  const trimmed = caption?.trim()
  return trimmed
    ? { kind: 'text', content: trimmed }
    : { kind: 'placeholder', content: placeholder }
}
