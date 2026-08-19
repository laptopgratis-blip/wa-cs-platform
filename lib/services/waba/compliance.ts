// SATU sumber kebenaran aturan kirim via Cloud API (jebakan referensi:
// aturan diduplikasi di 3 tempat → drift). Dipakai sendCloudText (free-text)
// dan sendCloudTemplate (template). Matriks lengkap: rencana Trek 2B §3.
//
// free-text : window tutup → WINDOW_CLOSED; else OK (blacklist tidak memblokir
//             balasan CS — konsisten dengan Baileys; blacklist = kampanye).
// template  : blacklist → BLACKLISTED; status≠APPROVED → TEMPLATE_NOT_APPROVED
//             /TEMPLATE_PAUSED; MARKETING & optOut → MARKETING_OPT_OUT;
//             expected = UTILITY dalam window ? 0 : rate[kategori];
//             saldo < expected (non-admin) → INSUFFICIENT_CREDIT.
// Sesi milik ADMIN → creditUserId null (platform membayar Meta langsung).

import type { MetaTemplateCategory, WabaTemplate } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  formatRp,
  getMessageCreditBalance,
  getMessageCreditRates,
} from '@/lib/services/message-credits'

export type CloudSendIntent = { kind: 'freeform' } | { kind: 'template'; templateId: string }

export type CloudComplianceCode =
  | 'SESSION_UNAVAILABLE'
  | 'BLACKLISTED'
  | 'WINDOW_CLOSED'
  | 'TEMPLATE_NOT_APPROVED'
  | 'TEMPLATE_PAUSED'
  | 'TEMPLATE_WABA_MISMATCH'
  | 'MARKETING_OPT_OUT'
  | 'INSUFFICIENT_CREDIT'

export interface ComplianceSession {
  id: string
  userId: string
  wabaId: string
  phoneNumberId: string
  status: string
  ownerRole: string
}

export interface ComplianceContact {
  id: string
  phoneNumber: string
  windowOpen: boolean
  windowExpiresAt: Date | null
  isBlacklisted: boolean
  marketingOptOut: boolean
}

export type ComplianceResult =
  | {
      ok: true
      session: ComplianceSession
      template: WabaTemplate | null
      contact: ComplianceContact | null
      to: string
      expectedChargeRp: number
      creditUserId: string | null
      category: MetaTemplateCategory | null
    }
  | { ok: false; code: CloudComplianceCode; message: string }

export function isWindowOpen(windowExpiresAt: Date | null | undefined, now = new Date()): boolean {
  return Boolean(windowExpiresAt && windowExpiresAt > now)
}

/**
 * Cek kelayakan kirim SEBELUM memanggil Meta. Tidak mengubah data.
 */
export async function assertCanSendCloud(input: {
  sessionId: string
  to: string
  intent: CloudSendIntent
}): Promise<ComplianceResult> {
  const to = input.to.replace(/\D/g, '')
  if (!to) return { ok: false, code: 'SESSION_UNAVAILABLE', message: 'Nomor tujuan tidak valid' }

  const row = await prisma.whatsappSession.findUnique({
    where: { id: input.sessionId },
    select: {
      id: true,
      userId: true,
      provider: true,
      status: true,
      wabaId: true,
      phoneNumberId: true,
      wabaTokenEnc: true,
      user: { select: { role: true } },
    },
  })
  if (!row || row.provider !== 'CLOUD_API') {
    return { ok: false, code: 'SESSION_UNAVAILABLE', message: 'Sesi Cloud API tidak ditemukan' }
  }
  if (!row.wabaId || !row.phoneNumberId || !row.wabaTokenEnc) {
    return { ok: false, code: 'SESSION_UNAVAILABLE', message: 'Sesi Cloud API belum punya kredensial lengkap' }
  }
  // Hanya DISCONNECTED (diputus user) yang diblokir lokal — ERROR/PAUSED
  // tetap boleh mencoba; Meta jadi sumber kebenaran.
  if (row.status === 'DISCONNECTED') {
    return { ok: false, code: 'SESSION_UNAVAILABLE', message: 'Sesi Cloud API sudah diputus — hubungkan ulang' }
  }
  const session: ComplianceSession = {
    id: row.id,
    userId: row.userId,
    wabaId: row.wabaId,
    phoneNumberId: row.phoneNumberId,
    status: row.status,
    ownerRole: row.user.role,
  }

  const contactRow = await prisma.contact.findFirst({
    where: { userId: row.userId, phoneNumber: to },
    select: { id: true, phoneNumber: true, windowExpiresAt: true, isBlacklisted: true, marketingOptOut: true },
    orderBy: { lastMessageAt: 'desc' },
  })
  const contact: ComplianceContact | null = contactRow
    ? {
        id: contactRow.id,
        phoneNumber: contactRow.phoneNumber,
        windowOpen: isWindowOpen(contactRow.windowExpiresAt),
        windowExpiresAt: contactRow.windowExpiresAt,
        isBlacklisted: contactRow.isBlacklisted,
        marketingOptOut: contactRow.marketingOptOut,
      }
    : null

  const creditUserId = session.ownerRole === 'ADMIN' ? null : session.userId

  if (input.intent.kind === 'freeform') {
    // Free-text = balasan CS dalam window; isBlacklisted di hulao hanya
    // mengecualikan kontak dari kampanye outbound (konsisten dengan Baileys),
    // jadi tidak memblokir balasan CS.
    if (!contact?.windowOpen) {
      return {
        ok: false,
        code: 'WINDOW_CLOSED',
        message:
          'Window 24 jam Meta sudah tutup untuk kontak ini — pesan bebas hanya bisa ' +
          'dikirim dalam 24 jam sejak pesan terakhir customer. Gunakan template Meta yang sudah disetujui.',
      }
    }
    return { ok: true, session, template: null, contact, to, expectedChargeRp: 0, creditUserId, category: null }
  }

  // Template = business-initiated (broadcast/follow-up/notif) → hormati blacklist.
  if (contact?.isBlacklisted) {
    return { ok: false, code: 'BLACKLISTED', message: 'Kontak ini di-blacklist — pesan tidak dikirim' }
  }

  const template = await prisma.wabaTemplate.findUnique({ where: { id: input.intent.templateId } })
  if (!template) {
    return { ok: false, code: 'TEMPLATE_NOT_APPROVED', message: 'Template tidak ditemukan' }
  }
  if (template.wabaId !== session.wabaId) {
    return { ok: false, code: 'TEMPLATE_WABA_MISMATCH', message: 'Template milik WABA lain — pilih template dari nomor ini' }
  }
  if (template.status === 'PAUSED') {
    return { ok: false, code: 'TEMPLATE_PAUSED', message: `Template "${template.name}" sedang PAUSED oleh Meta (kualitas rendah)` }
  }
  if (template.status !== 'APPROVED') {
    return {
      ok: false,
      code: 'TEMPLATE_NOT_APPROVED',
      message: `Template "${template.name}" berstatus ${template.status} — hanya template APPROVED yang bisa dikirim`,
    }
  }
  if (template.category === 'MARKETING' && contact?.marketingOptOut) {
    return {
      ok: false,
      code: 'MARKETING_OPT_OUT',
      message: 'Customer memilih berhenti menerima pesan marketing — pesan tidak dikirim',
    }
  }

  const rates = await getMessageCreditRates()
  const rate = rates[template.category]
  const expectedChargeRp = template.category === 'UTILITY' && contact?.windowOpen ? 0 : rate

  if (creditUserId && expectedChargeRp > 0) {
    const balance = await getMessageCreditBalance(creditUserId)
    if (balance < expectedChargeRp) {
      return {
        ok: false,
        code: 'INSUFFICIENT_CREDIT',
        message: `Kredit pesan kurang — butuh ${formatRp(expectedChargeRp)}, saldo ${formatRp(balance)}. Top up di menu Billing.`,
      }
    }
  }

  return {
    ok: true,
    session,
    template,
    contact,
    to,
    expectedChargeRp,
    creditUserId,
    category: template.category,
  }
}
