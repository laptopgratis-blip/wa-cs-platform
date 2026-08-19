// Layanan template Meta per WABA: draft lokal → submit ke Meta → status
// mengikuti Meta (webhook + sync). Semua fungsi never-throw (hasil
// {ok, ...}) kecuali disebut lain.

import type { MetaTemplateStatus, Prisma, WabaTemplate } from '@prisma/client'
import { prisma } from '@/lib/prisma'

import { getWabaCredentialsBySession, getWabaCredentialsByWaba } from './credentials'
import { graphRequest } from './graph'
import {
  buildCreateTemplatePayload,
  buildEditTemplatePayload,
} from './template-payload'
import { validateTemplateDraft, type TemplateDraftInput } from './template-validate'
import { mapMetaCategory, mapMetaStatus } from './templates-sync'
import type { WabaTemplateButton } from './types'

export type { TemplateDraftInput }

export interface TemplateOpResult {
  ok: boolean
  error?: string
  template?: WabaTemplate
  warnings?: string[]
}

// Status yang masih boleh diedit dan dikirim ulang ke Meta (jadi PENDING lagi).
const EDITABLE_REMOTE_STATUSES: MetaTemplateStatus[] = ['APPROVED', 'REJECTED', 'PAUSED']

/** Pesan error Meta saat KIRIM template → teks + efek samping (dipakai WI-3). */
export const TEMPLATE_SEND_ERROR_MAP: Record<
  number,
  { message: string; code: 'META_ERROR' | 'RATE_LIMIT' | 'TEMPLATE_PARAM_MISMATCH' | 'WINDOW_CLOSED' | 'TEMPLATE_NOT_APPROVED' | 'TEMPLATE_PAUSED' | 'MARKETING_OPT_OUT' | 'TOKEN_INVALID' | 'PAYMENT_REQUIRED' }
> = {
  132000: { message: 'Jumlah parameter tidak cocok dengan template', code: 'TEMPLATE_PARAM_MISMATCH' },
  132001: { message: 'Template tidak ditemukan / belum disetujui di Meta', code: 'TEMPLATE_NOT_APPROVED' },
  132005: { message: 'Teks template terlalu panjang', code: 'TEMPLATE_PARAM_MISMATCH' },
  132007: { message: 'Format template melanggar kebijakan Meta', code: 'META_ERROR' },
  132012: { message: 'Format parameter tidak sesuai (newline/tab/terlalu panjang)', code: 'TEMPLATE_PARAM_MISMATCH' },
  132015: { message: 'Template sedang PAUSED oleh Meta (kualitas rendah)', code: 'TEMPLATE_PAUSED' },
  132016: { message: 'Template DISABLED oleh Meta', code: 'TEMPLATE_NOT_APPROVED' },
  131042: {
    message: 'Metode pembayaran WABA bermasalah — tambahkan/perbarui di WhatsApp Manager > Billing',
    code: 'PAYMENT_REQUIRED',
  },
  131047: { message: 'Window 24 jam sudah tutup — gunakan template', code: 'WINDOW_CLOSED' },
  131026: { message: 'Pesan tidak bisa dikirim ke nomor ini (belum pernah chat / bukan WA)', code: 'META_ERROR' },
  131049: { message: 'Meta menahan pesan marketing ke nomor ini (frequency cap)', code: 'META_ERROR' },
  131050: { message: 'Customer memilih berhenti menerima pesan marketing', code: 'MARKETING_OPT_OUT' },
  130429: { message: 'Rate limit Meta — coba lagi sebentar', code: 'RATE_LIMIT' },
  131056: { message: 'Terlalu banyak pesan ke nomor yang sama — coba lagi nanti', code: 'RATE_LIMIT' },
  131048: { message: 'Pengiriman dibatasi Meta (spam rate) — coba lagi nanti', code: 'RATE_LIMIT' },
  190: { message: 'Token Meta ditolak — hubungkan ulang nomor', code: 'TOKEN_INVALID' },
}

function sessionOwnedByUser(sessionId: string, userId: string) {
  return prisma.whatsappSession.findFirst({
    where: { id: sessionId, userId, provider: 'CLOUD_API' },
    select: { id: true, wabaId: true },
  })
}

function draftToData(draft: TemplateDraftInput) {
  return {
    name: draft.name,
    language: draft.language,
    category: draft.category,
    headerType: draft.headerType ?? null,
    headerText: draft.headerType === 'TEXT' ? draft.headerText ?? null : null,
    headerTextExample: draft.headerType === 'TEXT' ? draft.headerTextExample ?? null : null,
    headerMediaHandle: draft.headerType && draft.headerType !== 'TEXT' ? draft.headerMediaHandle ?? null : null,
    headerMediaUrl: draft.headerType && draft.headerType !== 'TEXT' ? draft.headerMediaUrl ?? null : null,
    bodyText: draft.category === 'AUTHENTICATION' ? '' : draft.bodyText,
    bodyExamples: draft.bodyExamples ?? [],
    footerText: draft.category === 'AUTHENTICATION' ? null : draft.footerText ?? null,
    buttons: (draft.buttons ?? null) as Prisma.InputJsonValue | undefined,
    authAddSecurityRecommendation: draft.authAddSecurityRecommendation ?? true,
    authCodeExpirationMinutes: draft.authCodeExpirationMinutes ?? null,
  }
}

// ── Create ──

export async function createTemplateDraft(input: {
  userId: string
  sessionId: string
  draft: TemplateDraftInput
  purposeKey?: string | null
}): Promise<TemplateOpResult> {
  try {
    const session = await sessionOwnedByUser(input.sessionId, input.userId)
    if (!session?.wabaId) return { ok: false, error: 'Sesi Cloud API tidak ditemukan' }

    const v = validateTemplateDraft(input.draft)
    if (!v.ok) return { ok: false, error: v.errors.join('; '), warnings: v.warnings }

    const dup = await prisma.wabaTemplate.findUnique({
      where: {
        wabaId_name_language: {
          wabaId: session.wabaId,
          name: input.draft.name,
          language: input.draft.language,
        },
      },
      select: { id: true, status: true },
    })
    if (dup && dup.status !== 'DELETED') {
      return { ok: false, error: `Template "${input.draft.name}" (${input.draft.language}) sudah ada di WABA ini` }
    }

    const data = {
      ...draftToData(input.draft),
      userId: input.userId,
      wabaId: session.wabaId,
      purposeKey: input.purposeKey ?? null,
      status: 'DRAFT' as MetaTemplateStatus,
      metaTemplateId: null,
      rejectionReason: null,
      submittedAt: null,
      approvedAt: null,
    }
    // Nama yang pernah DELETED boleh dipakai ulang lokal (Meta: 30 hari).
    const template = dup
      ? await prisma.wabaTemplate.update({ where: { id: dup.id }, data })
      : await prisma.wabaTemplate.create({ data })
    return { ok: true, template, warnings: v.warnings }
  } catch (err) {
    console.error('[waba/templates] createTemplateDraft gagal:', err)
    return { ok: false, error: `Gagal menyimpan draft: ${(err as Error).message}` }
  }
}

// ── Submit ──

interface MetaCreateTemplateResponse {
  id?: string
  status?: string
  category?: string
}

export async function submitTemplate(templateId: string, userId: string): Promise<TemplateOpResult> {
  try {
    const tpl = await prisma.wabaTemplate.findFirst({ where: { id: templateId, userId } })
    if (!tpl) return { ok: false, error: 'Template tidak ditemukan' }
    if (tpl.status !== 'DRAFT' && tpl.status !== 'REJECTED' && tpl.status !== 'DELETED') {
      return { ok: false, error: `Template berstatus ${tpl.status} — tidak perlu disubmit ulang` }
    }
    // REJECTED yang sudah punya metaTemplateId → jalur edit (POST /{id}).
    if (tpl.status === 'REJECTED' && tpl.metaTemplateId) {
      return resubmitViaEdit(tpl)
    }

    const v = validateTemplateDraft(tpl as unknown as TemplateDraftInput)
    if (!v.ok) return { ok: false, error: v.errors.join('; '), warnings: v.warnings }

    const credRes = await getWabaCredentialsByWaba(tpl.wabaId, userId)
    if (!credRes.ok) return { ok: false, error: credRes.error }

    const res = await graphRequest<MetaCreateTemplateResponse>(
      `/${tpl.wabaId}/message_templates`,
      { method: 'POST', token: credRes.creds.token, body: buildCreateTemplatePayload(tpl) },
    )
    if (!res.ok) {
      const e = res.error
      // Nama sudah ada di Meta (dibuat di luar hulao / sisa hapus <30 hari) →
      // sarankan sync. Jangan tandai REJECTED — itu hak Meta.
      const hint =
        e.code === 100 && /already exists|name/i.test(e.message)
          ? ' — nama sudah dipakai di Meta; jalankan "Sinkron dari Meta" atau ganti nama'
          : ''
      return { ok: false, error: `Meta menolak template: ${e.message}${e.code ? ` (code ${e.code}${e.subcode ? `/${e.subcode}` : ''})` : ''}${hint}` }
    }

    const status = mapMetaStatus(res.data.status ?? 'PENDING')
    const category = mapMetaCategory(res.data.category) ?? tpl.category
    const now = new Date()
    const template = await prisma.wabaTemplate.update({
      where: { id: tpl.id },
      data: {
        metaTemplateId: res.data.id ?? tpl.metaTemplateId,
        status,
        category,
        submittedAt: now,
        rejectionReason: null,
        ...(status === 'APPROVED' ? { approvedAt: now } : {}),
        lastSyncedAt: now,
      },
    })
    return { ok: true, template, warnings: v.warnings }
  } catch (err) {
    console.error('[waba/templates] submitTemplate gagal:', err)
    return { ok: false, error: `Gagal submit template: ${(err as Error).message}` }
  }
}

async function resubmitViaEdit(tpl: WabaTemplate): Promise<TemplateOpResult> {
  const credRes = await getWabaCredentialsByWaba(tpl.wabaId, tpl.userId)
  if (!credRes.ok) return { ok: false, error: credRes.error }
  const res = await graphRequest<{ success?: boolean }>(`/${tpl.metaTemplateId}`, {
    method: 'POST',
    token: credRes.creds.token,
    body: buildEditTemplatePayload(tpl, { includeCategory: true }),
  })
  if (!res.ok) {
    return { ok: false, error: `Meta menolak perubahan template: ${res.error.message}${res.error.code ? ` (code ${res.error.code})` : ''}` }
  }
  const template = await prisma.wabaTemplate.update({
    where: { id: tpl.id },
    data: { status: 'PENDING', submittedAt: new Date(), rejectionReason: null },
  })
  return { ok: true, template }
}

// ── Update ──

export async function updateTemplate(input: {
  templateId: string
  userId: string
  draft: TemplateDraftInput
}): Promise<TemplateOpResult> {
  try {
    const tpl = await prisma.wabaTemplate.findFirst({ where: { id: input.templateId, userId: input.userId } })
    if (!tpl) return { ok: false, error: 'Template tidak ditemukan' }

    const v = validateTemplateDraft(input.draft)
    if (!v.ok) return { ok: false, error: v.errors.join('; '), warnings: v.warnings }

    // DRAFT → update lokal bebas (nama/bahasa boleh berubah).
    if (tpl.status === 'DRAFT' || !tpl.metaTemplateId) {
      if (input.draft.name !== tpl.name || input.draft.language !== tpl.language) {
        const dup = await prisma.wabaTemplate.findFirst({
          where: {
            wabaId: tpl.wabaId,
            name: input.draft.name,
            language: input.draft.language,
            id: { not: tpl.id },
            status: { not: 'DELETED' },
          },
          select: { id: true },
        })
        if (dup) return { ok: false, error: `Template "${input.draft.name}" (${input.draft.language}) sudah ada` }
      }
      const template = await prisma.wabaTemplate.update({
        where: { id: tpl.id },
        data: draftToData(input.draft),
      })
      return { ok: true, template, warnings: v.warnings }
    }

    if (!EDITABLE_REMOTE_STATUSES.includes(tpl.status)) {
      return { ok: false, error: `Template sedang ${tpl.status === 'PENDING' ? 'direview Meta' : tpl.status} — tunggu hasilnya sebelum mengubah` }
    }
    // Sudah di Meta: nama & bahasa TIDAK bisa diubah; kategori & komponen bisa.
    if (input.draft.name !== tpl.name || input.draft.language !== tpl.language) {
      return { ok: false, error: 'Nama dan bahasa template yang sudah di Meta tidak bisa diubah — buat template baru' }
    }
    const next = { ...tpl, ...draftToData(input.draft) }
    const credRes = await getWabaCredentialsByWaba(tpl.wabaId, input.userId)
    if (!credRes.ok) return { ok: false, error: credRes.error }
    const res = await graphRequest<{ success?: boolean }>(`/${tpl.metaTemplateId}`, {
      method: 'POST',
      token: credRes.creds.token,
      body: buildEditTemplatePayload(next, { includeCategory: next.category !== tpl.category }),
    })
    if (!res.ok) {
      return { ok: false, error: `Meta menolak perubahan: ${res.error.message}${res.error.code ? ` (code ${res.error.code})` : ''}` }
    }
    // Setelah edit, Meta mereview ulang → PENDING (approved lama tidak bisa
    // dipakai sampai disetujui lagi).
    const template = await prisma.wabaTemplate.update({
      where: { id: tpl.id },
      data: { ...draftToData(input.draft), status: 'PENDING', submittedAt: new Date(), rejectionReason: null },
    })
    return { ok: true, template, warnings: v.warnings }
  } catch (err) {
    console.error('[waba/templates] updateTemplate gagal:', err)
    return { ok: false, error: `Gagal mengubah template: ${(err as Error).message}` }
  }
}

// ── Delete ──

export async function deleteTemplate(templateId: string, userId: string): Promise<TemplateOpResult & { soft?: boolean }> {
  try {
    const tpl = await prisma.wabaTemplate.findFirst({
      where: { id: templateId, userId },
      include: { _count: { select: { messages: true } } },
    })
    if (!tpl) return { ok: false, error: 'Template tidak ditemukan' }

    if (tpl.metaTemplateId && tpl.status !== 'DELETED') {
      const credRes = await getWabaCredentialsByWaba(tpl.wabaId, userId)
      if (!credRes.ok) return { ok: false, error: credRes.error }
      const res = await graphRequest<{ success?: boolean }>(
        `/${tpl.wabaId}/message_templates?hsm_id=${encodeURIComponent(tpl.metaTemplateId)}&name=${encodeURIComponent(tpl.name)}`,
        { method: 'DELETE', token: credRes.creds.token },
      )
      // Sudah tidak ada di Meta (100/2388xxx) → lanjut bersihkan lokal.
      if (!res.ok && res.error.httpStatus !== 404 && res.error.code !== 100) {
        return { ok: false, error: `Meta menolak hapus template: ${res.error.message}` }
      }
    }

    const referenced = tpl._count.messages > 0 || (await isTemplateReferenced(tpl.id))
    if (referenced) {
      const template = await prisma.wabaTemplate.update({
        where: { id: tpl.id },
        data: { status: 'DELETED' },
      })
      return { ok: true, template, soft: true }
    }
    await prisma.wabaTemplate.delete({ where: { id: tpl.id } })
    return { ok: true, soft: false }
  } catch (err) {
    console.error('[waba/templates] deleteTemplate gagal:', err)
    return { ok: false, error: `Gagal menghapus template: ${(err as Error).message}` }
  }
}

// Relasi Broadcast/FollowUpTemplate baru ada di Migrasi 2 — cek dinamis
// supaya file ini tidak perlu diubah lagi nanti.
async function isTemplateReferenced(templateId: string): Promise<boolean> {
  const db = prisma as unknown as Record<string, { count?: (args: unknown) => Promise<number> } | undefined>
  const checks: Array<Promise<number>> = []
  if (db.broadcast?.count) {
    checks.push(db.broadcast.count({ where: { templateId } }).catch(() => 0))
  }
  if (db.followUpTemplate?.count) {
    checks.push(db.followUpTemplate.count({ where: { metaTemplateId: templateId } }).catch(() => 0))
  }
  const counts = await Promise.all(checks)
  return counts.some((c) => c > 0)
}

// ── Query ──

export async function findApprovedTemplate(input: {
  wabaId: string
  purposeKey: string
}): Promise<WabaTemplate | null> {
  return prisma.wabaTemplate.findFirst({
    where: { wabaId: input.wabaId, purposeKey: input.purposeKey, status: 'APPROVED' },
    orderBy: { approvedAt: 'desc' },
  })
}

export async function listTemplatesForUser(
  userId: string,
  filter: { wabaId?: string; status?: MetaTemplateStatus; includeDeleted?: boolean } = {},
): Promise<WabaTemplate[]> {
  return prisma.wabaTemplate.findMany({
    where: {
      userId,
      ...(filter.wabaId ? { wabaId: filter.wabaId } : {}),
      ...(filter.status ? { status: filter.status } : filter.includeDeleted ? {} : { status: { not: 'DELETED' } }),
    },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  })
}

/** Sesi Cloud API milik user + wabaId (untuk API/halaman template). */
export async function listCloudSessionsForUser(userId: string) {
  return prisma.whatsappSession.findMany({
    where: { userId, provider: 'CLOUD_API', isActive: true, wabaId: { not: null } },
    select: { id: true, displayName: true, phoneNumber: true, wabaId: true, status: true },
    orderBy: { updatedAt: 'desc' },
  })
}

/** Kredensial via sesi (dipakai route yang menerima sessionId). */
export { getWabaCredentialsBySession }

/** Bentuk tombol tipe aman dari kolom Json (re-export untuk API/UI). */
export type { WabaTemplateButton }
