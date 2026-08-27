// Sinkronisasi template dari Meta → tabel WabaTemplate.
// UPSERT by (wabaId, name, language) — JANGAN delete-all-recreate (FK dari
// Message/Broadcast/FollowUpTemplate). Template yang hilang dari Meta
// setelah paging lengkap → status DELETED (soft).

import { Prisma, type MetaTemplateCategory, type MetaTemplateStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

import { getWabaCredentialsByWaba } from './credentials'
import { graphRequestPaged } from './graph'
import { parseMetaComponents } from './template-payload'

export interface MetaTemplateRow {
  id: string
  name: string
  status?: string
  category?: string
  language?: string
  components?: unknown
  rejected_reason?: string
  quality_score?: { score?: string; date?: number; reasons?: string[] | null }
  previous_category?: string
}

const TEMPLATE_FIELDS =
  'id,name,status,category,language,components,rejected_reason,quality_score,previous_category'

/** Map status string Meta → enum lokal. Tak dikenal → PENDING (aman). */
export function mapMetaStatus(raw: string | undefined): MetaTemplateStatus {
  const s = (raw ?? '').toUpperCase()
  switch (s) {
    case 'APPROVED':
      return 'APPROVED'
    case 'REJECTED':
      return 'REJECTED'
    case 'PAUSED':
      return 'PAUSED'
    case 'DISABLED':
      return 'DISABLED'
    case 'IN_APPEAL':
      return 'IN_APPEAL'
    case 'LIMIT_EXCEEDED':
      return 'LIMIT_EXCEEDED'
    case 'DELETED':
    case 'PENDING_DELETION':
      return 'DELETED'
    case 'PENDING':
    case 'FLAGGED':
    default:
      return 'PENDING'
  }
}

export function mapMetaCategory(raw: string | undefined): MetaTemplateCategory | null {
  const c = (raw ?? '').toUpperCase()
  if (c === 'MARKETING' || c === 'UTILITY' || c === 'AUTHENTICATION') return c
  return null
}

export interface SyncTemplatesResult {
  ok: boolean
  error?: string
  created: number
  updated: number
  markedDeleted: number
  truncated?: boolean
}

/**
 * Tarik semua template WABA dari Meta dan upsert ke DB. `userId` = pemilik
 * row baru (template yang dibuat di luar hulao). Never-throw.
 */
export async function syncTemplatesFromMeta(input: {
  wabaId: string
  userId: string
}): Promise<SyncTemplatesResult> {
  const base: SyncTemplatesResult = { ok: false, created: 0, updated: 0, markedDeleted: 0 }
  try {
    const credRes = await getWabaCredentialsByWaba(input.wabaId, input.userId)
    if (!credRes.ok) return { ...base, error: credRes.error }

    const res = await graphRequestPaged<MetaTemplateRow>(
      `/${input.wabaId}/message_templates?fields=${TEMPLATE_FIELDS}&limit=100`,
      { token: credRes.creds.token },
    )
    if (!res.ok) {
      return { ...base, error: `Meta menolak daftar template: ${res.error.message}` }
    }

    const now = new Date()
    const seenIds = new Set<string>()
    let created = 0
    let updated = 0

    for (const row of res.data) {
      if (!row?.id || !row.name) continue
      // Tandai TERLIHAT dulu — template kategori tak dikenal (legacy / enum
      // baru Meta) di-skip dari upsert tapi TIDAK boleh dianggap hilang
      // (blok DELETED di bawah memakai seenIds).
      seenIds.add(String(row.id))
      const category = mapMetaCategory(row.category)
      if (!category) continue // kategori tak dikenal — lewati upsert
      const language = row.language ?? 'id'
      const status = mapMetaStatus(row.status)
      const parsed = parseMetaComponents(row.components)

      const common = {
        category,
        status,
        metaTemplateId: String(row.id),
        rejectionReason: status === 'REJECTED' ? row.rejected_reason ?? null : null,
        qualityScore: row.quality_score?.score ?? null,
        componentsSnapshot: (row.components ?? null) as Prisma.InputJsonValue,
        lastSyncedAt: now,
        ...(status === 'APPROVED' ? { approvedAt: now } : {}),
      }

      const existing = await prisma.wabaTemplate.findUnique({
        where: { wabaId_name_language: { wabaId: input.wabaId, name: row.name, language } },
        select: { id: true, status: true, approvedAt: true, metaTemplateId: true },
      })

      if (existing) {
        // Row lokal bisa punya metaTemplateId lain (edit → Meta kadang
        // memberi id baru) — ikuti Meta. Jaga approvedAt yang sudah ada.
        await prisma.wabaTemplate.update({
          where: { id: existing.id },
          data: {
            ...common,
            approvedAt: status === 'APPROVED' ? existing.approvedAt ?? now : existing.approvedAt,
            // Kolom teks selalu diisi ulang dari Meta — Meta = sumber kebenaran.
            headerType: parsed.headerType,
            headerText: parsed.headerText,
            headerTextExample: parsed.headerTextExample,
            ...(parsed.headerMediaUrl ? { headerMediaUrl: parsed.headerMediaUrl } : {}),
            bodyText: parsed.bodyText,
            bodyExamples: parsed.bodyExamples,
            footerText: parsed.footerText,
            // Tombol dihapus di Meta → kolom lokal HARUS dikosongkan (DbNull),
            // bukan dilewati — tombol hantu membuat send kirim komponen button
            // yang tidak ada di Meta → error 132000.
            buttons: parsed.buttons
              ? (parsed.buttons as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
            authAddSecurityRecommendation: parsed.authAddSecurityRecommendation,
            authCodeExpirationMinutes: parsed.authCodeExpirationMinutes,
          },
        })
        updated += 1
      } else {
        await prisma.wabaTemplate.create({
          data: {
            userId: input.userId,
            wabaId: input.wabaId,
            name: row.name,
            language,
            ...common,
            headerType: parsed.headerType,
            headerText: parsed.headerText,
            headerTextExample: parsed.headerTextExample,
            headerMediaUrl: parsed.headerMediaUrl,
            bodyText: parsed.bodyText,
            bodyExamples: parsed.bodyExamples,
            footerText: parsed.footerText,
            buttons: (parsed.buttons ?? undefined) as Prisma.InputJsonValue | undefined,
            authAddSecurityRecommendation: parsed.authAddSecurityRecommendation,
            authCodeExpirationMinutes: parsed.authCodeExpirationMinutes,
            submittedAt: now,
          },
        })
        created += 1
      }
    }

    // Tandai DELETED hanya bila daftar lengkap (tidak terpotong paging) —
    // kalau terpotong kita tidak tahu apa yang benar-benar hilang.
    let markedDeleted = 0
    if (!res.truncated) {
      const gone = await prisma.wabaTemplate.updateMany({
        where: {
          wabaId: input.wabaId,
          metaTemplateId: { not: null, notIn: Array.from(seenIds) },
          status: { notIn: ['DELETED', 'DRAFT'] },
        },
        data: { status: 'DELETED', lastSyncedAt: now },
      })
      markedDeleted = gone.count
    }

    return { ok: true, created, updated, markedDeleted, truncated: res.truncated }
  } catch (err) {
    console.error('[waba/templates-sync] gagal:', err)
    return { ...base, error: `Sinkronisasi template gagal: ${(err as Error).message}` }
  }
}
