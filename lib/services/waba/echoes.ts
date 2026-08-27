// Coexistence: pesan yang dikirim owner LANGSUNG dari aplikasi WhatsApp
// Business di HP (webhook field `smb_message_echoes`). Dicatat sebagai
// balasan CS (role AGENT, source WA_DIRECT) — paritas persis dengan jalur
// Baileys `fromMe` sehingga inbox web tetap utuh dan AI tahu CS sudah
// menjawab. Pesan yang dikirim hulao sendiri via API TIDAK di-echo Meta.

import { prisma } from '@/lib/prisma'
import {
  isDuplicateExternalMessageError,
  saveMessage,
} from '@/lib/services/cs-pipeline/message-store'

import { relayEmit } from './realtime'
import type { WabaChangeValue, WabaMessageEcho } from './types'

export async function handleMessageEchoes(value: WabaChangeValue): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id
  if (!phoneNumberId) return

  const session = await prisma.whatsappSession.findUnique({
    where: { phoneNumberId },
    select: { id: true, provider: true, isActive: true },
  })
  if (!session || session.provider !== 'CLOUD_API' || !session.isActive) return

  for (const echo of value.message_echoes ?? []) {
    try {
      await processOne(session.id, echo)
    } catch (err) {
      if (isDuplicateExternalMessageError(err)) continue
      console.error(`[waba/echoes] gagal proses echo wamid=${echo.id}:`, err)
    }
  }
}

async function processOne(sessionId: string, echo: WabaMessageEcho): Promise<void> {
  const to = echo.to?.replace(/\D/g, '') ?? ''
  if (!to || !echo.id) return

  // Dedup lintas retry (wamid unik; race ditangkap sebagai duplicate error).
  const existing = await prisma.message.findUnique({
    where: { externalMsgId: echo.id },
    select: { id: true },
  })
  if (existing) return

  const content = extractEchoContent(echo)
  if (!content) return

  const saved = await saveMessage({
    sessionId,
    phoneNumber: to,
    content,
    role: 'AGENT',
    source: 'WA_DIRECT',
    externalMsgId: echo.id,
    status: 'SENT',
  })
  if (!saved) return

  void relayEmit('inbox:message', {
    sessionId,
    contactId: saved.contactId,
    phoneNumber: to,
    name: null,
    message: {
      id: saved.messageId,
      content,
      role: 'AGENT',
      status: 'SENT',
      source: 'WA_DIRECT',
      createdAt: new Date().toISOString(),
    },
  })
}

function extractEchoContent(echo: WabaMessageEcho): string | null {
  switch (echo.type) {
    case 'text':
      return echo.text?.body?.trim() || null
    case 'image':
      return echo.image?.caption?.trim() || '[Gambar]'
    case 'video':
      return echo.video?.caption?.trim() || '[Video]'
    case 'document':
      return (
        echo.document?.caption?.trim() ||
        (echo.document?.filename ? `[Dokumen: ${echo.document.filename}]` : '[Dokumen]')
      )
    case 'audio':
      return echo.audio?.voice ? '[Voice note]' : '[Audio]'
    case 'sticker':
      return '[Stiker]'
    default:
      return null
  }
}
