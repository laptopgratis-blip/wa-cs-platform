// Kirim pesan TEMPLATE via Cloud API — satu-satunya jalur kirim template.
// Alur: assertCanSendCloud → buildSendComponents → Graph POST messages →
// error map (+ efek samping) → simpan Message (+ jejak billing) →
// chargeMessageCredit (reference wamid, idempoten) → relay realtime.
// Kontrak: NEVER throw.

import { prisma } from '@/lib/prisma'
import { saveMessage, isDuplicateExternalMessageError } from '@/lib/services/cs-pipeline/message-store'
import { chargeMessageCredit } from '@/lib/services/message-credits'

import { markMarketingOptOut } from './billing-reconcile'
import { assertCanSendCloud, type CloudComplianceCode } from './compliance'
import { getWabaCredentialsBySession } from './credentials'
import { graphRequest } from './graph'
import { relayEmit } from './realtime'
import {
  buildSendComponents,
  renderTemplateText,
  TemplateParamError,
  type TemplateSendParams,
} from './template-payload'
import { TEMPLATE_SEND_ERROR_MAP } from './templates'
import { syncTemplatesFromMeta } from './templates-sync'

export type TemplateSendPurpose = 'CS' | 'BROADCAST' | 'FOLLOWUP' | 'OTP' | 'NOTIF' | 'TEST' | 'HANDOFF' | 'LMS'

export type CloudTemplateSendCode =
  | CloudComplianceCode
  | 'META_ERROR'
  | 'RATE_LIMIT'
  | 'TEMPLATE_PARAM_MISMATCH'
  | 'TOKEN_INVALID'
  | 'PAYMENT_REQUIRED'

export interface SendCloudTemplateInput {
  sessionId: string
  to: string
  templateId: string
  params: TemplateSendParams
  purpose: TemplateSendPurpose
  /** Message.source: 'TEMPLATE' | 'BROADCAST' | 'FOLLOWUP' | 'SYSTEM' | 'WEB_DASHBOARD' */
  source: string
  contactId?: string
  broadcastRecipientId?: string
  pushName?: string | null
}

export interface SendCloudTemplateResult {
  success: boolean
  data?: {
    sessionId: string
    phoneNumber: string
    messageId: string | null // wamid
    messageDbId: string | null
    contactId: string | null
    chargedRp: number
    category: string
  }
  error?: string
  code?: CloudTemplateSendCode
}

interface CloudMessagesResponse {
  messages?: { id: string; message_status?: string }[]
}

// Purpose yang tampil di inbox realtime (pesan CS langsung ke kontak).
const REALTIME_PURPOSES: TemplateSendPurpose[] = ['CS', 'TEST']

export async function sendCloudTemplate(input: SendCloudTemplateInput): Promise<SendCloudTemplateResult> {
  try {
    const check = await assertCanSendCloud({
      sessionId: input.sessionId,
      to: input.to,
      intent: { kind: 'template', templateId: input.templateId },
    })
    if (!check.ok) return { success: false, error: check.message, code: check.code }
    const { session, template, to, expectedChargeRp, creditUserId } = check
    if (!template) return { success: false, error: 'Template tidak ditemukan', code: 'TEMPLATE_NOT_APPROVED' }

    let components: unknown[]
    try {
      components = buildSendComponents(template, input.params)
    } catch (err) {
      if (err instanceof TemplateParamError) {
        return { success: false, error: err.message, code: 'TEMPLATE_PARAM_MISMATCH' }
      }
      throw err
    }

    const credRes = await getWabaCredentialsBySession(session.id)
    if (!credRes.ok) return { success: false, error: credRes.error, code: 'SESSION_UNAVAILABLE' }

    const res = await graphRequest<CloudMessagesResponse>(`/${session.phoneNumberId}/messages`, {
      method: 'POST',
      token: credRes.creds.token,
      body: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.language },
          ...(components.length > 0 ? { components } : {}),
        },
      },
    })

    if (!res.ok) {
      return handleMetaError({
        code: res.error.code,
        httpStatus: res.error.httpStatus,
        message: res.error.message,
        sessionId: session.id,
        userId: session.userId,
        wabaId: session.wabaId,
        templateId: template.id,
        to,
      })
    }

    const wamid = res.data.messages?.[0]?.id ?? null
    const content = renderTemplateText(template, input.params)
    const category = template.category

    // Simpan Message (+ jejak billing). Kontak dibuat bila belum ada.
    let messageDbId: string | null = null
    let contactId: string | null = input.contactId ?? null
    try {
      const saved = await saveMessage({
        sessionId: session.id,
        phoneNumber: to,
        pushName: input.pushName ?? null,
        content,
        role: 'AGENT',
        source: input.source,
        externalMsgId: wamid,
        status: 'SENT',
        billing: {
          templateId: template.id,
          creditUserId,
          creditChargedRp: expectedChargeRp,
          pricingCategory: category.toLowerCase(),
          broadcastRecipientId: input.broadcastRecipientId ?? null,
        },
        // OTP/notif platform dari sesi admin: jangan REPIN kontak user lain.
        skipRepin: session.ownerRole === 'ADMIN' && input.purpose !== 'CS',
      })
      if (saved) {
        messageDbId = saved.messageId
        contactId = saved.contactId
      }
    } catch (err) {
      if (isDuplicateExternalMessageError(err) && wamid) {
        const existing = await prisma.message.findUnique({
          where: { externalMsgId: wamid },
          select: { id: true, contactId: true },
        })
        messageDbId = existing?.id ?? null
        contactId = existing?.contactId ?? contactId
      } else {
        // Pesan SUDAH terkirim — jangan laporkan gagal; catat saja.
        console.error('[waba/send-template] simpan Message gagal (pesan sudah terkirim):', err)
      }
    }

    // Potong kredit SETELAH Meta menerima (idempoten by wamid).
    let chargedRp = 0
    if (creditUserId && expectedChargeRp > 0 && wamid) {
      const ch = await chargeMessageCredit({
        userId: creditUserId,
        amountRp: expectedChargeRp,
        category,
        reference: wamid,
        messageId: messageDbId,
        description: `Template ${template.name} (${input.purpose.toLowerCase()})`,
      })
      if (ch.ok) {
        chargedRp = expectedChargeRp
      } else {
        console.error('[waba/send-template] charge kredit gagal:', ch.error)
        // Ledger tidak terpotong → nolkan jejak di Message supaya rekonsiliasi/
        // refund tidak mengkredit uang yang tidak pernah dipotong.
        if (messageDbId) {
          await prisma.message
            .updateMany({ where: { id: messageDbId }, data: { creditChargedRp: 0 } })
            .catch(() => undefined)
        }
      }
    }

    if (REALTIME_PURPOSES.includes(input.purpose) && contactId) {
      void relayEmit('inbox:message', {
        sessionId: session.id,
        contactId,
        phoneNumber: to,
        name: input.pushName ?? null,
        message: {
          id: messageDbId,
          content,
          role: 'AGENT',
          status: 'SENT',
          source: input.source,
          createdAt: new Date().toISOString(),
        },
      })
    }

    return {
      success: true,
      data: {
        sessionId: session.id,
        phoneNumber: to,
        messageId: wamid,
        messageDbId,
        contactId,
        chargedRp,
        category,
      },
    }
  } catch (err) {
    console.error('[waba/send-template] gagal:', err)
    return { success: false, error: `Gagal kirim template: ${(err as Error).message}`, code: 'META_ERROR' }
  }
}

async function handleMetaError(ctx: {
  code?: number
  httpStatus?: number
  message: string
  sessionId: string
  userId: string
  wabaId: string
  templateId: string
  to: string
}): Promise<SendCloudTemplateResult> {
  const mapped = ctx.code !== undefined ? TEMPLATE_SEND_ERROR_MAP[ctx.code] : undefined
  const suffix = ctx.code ? ` (code ${ctx.code})` : ''

  if ((ctx.code !== undefined && ctx.code === 190) || ctx.httpStatus === 401) {
    await prisma.whatsappSession
      .update({
        where: { id: ctx.sessionId },
        data: { status: 'ERROR', lastError: `Token Meta ditolak: ${ctx.message}` },
      })
      .catch(() => undefined)
    return { success: false, error: 'Token Meta ditolak — hubungkan ulang nomor via Embedded Signup', code: 'TOKEN_INVALID' }
  }
  if (ctx.code === 132015) {
    await prisma.wabaTemplate
      .update({ where: { id: ctx.templateId }, data: { status: 'PAUSED' } })
      .catch(() => undefined)
  } else if (ctx.code === 132001 || ctx.code === 132016) {
    // Status lokal basi → sinkron di latar belakang.
    void syncTemplatesFromMeta({ wabaId: ctx.wabaId, userId: ctx.userId })
  } else if (ctx.code === 131050) {
    await markMarketingOptOut({
      userId: ctx.userId,
      phone: ctx.to,
      source: 'META_ERROR_131050',
      optOut: true,
      detail: ctx.message,
    }).catch(() => undefined)
  }

  if (mapped) {
    return { success: false, error: `${mapped.message}${suffix}`, code: mapped.code }
  }
  return { success: false, error: `Meta menolak pesan: ${ctx.message}${suffix}`, code: 'META_ERROR' }
}
