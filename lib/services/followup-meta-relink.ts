// Relink otomatis FollowUpTemplate → template Meta di WABA aktif saat seller
// ganti nomor/WABA (atau template lama dihapus/ditolak). Keputusan murni ada
// di followup-meta-link.ts; modul ini memuat data & menulis DB.
//
// Aturan:
// - WABA aktif = sesi CLOUD_API, CONNECTED, isActive, wabaId terisi milik user
//   (sama dengan kandidat pengirim listSenderCandidates).
// - Tanpa WABA aktif → hanya laporan, tidak menulis apa pun.
// - Update kondisional per baris (where metaTemplateId = lama) supaya tidak
//   menimpa pilihan seller yang berubah di antara baca & tulis; queue PENDING
//   template itu di-reset resolvedParams-nya (dihitung ulang saat kirim).
// - Tidak pernah submit template ke Meta.
// - JANGAN dipanggil dari dalam syncTemplatesFromMeta (import cycle) —
//   panggil setelahnya dari route/cron/webhook (best-effort).

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import {
  planRelinks,
  type MetaTemplateLite,
  type RelinkChange,
  type RelinkUnresolved,
} from '@/lib/services/followup-meta-link'
import { STARTER_TEMPLATES } from '@/lib/services/waba/starter-pack'
import { syncTemplatesFromMeta } from '@/lib/services/waba/templates-sync'

const META_LITE_SELECT = {
  id: true,
  userId: true,
  wabaId: true,
  status: true,
  purposeKey: true,
  name: true,
  language: true,
  category: true,
  bodyText: true,
} as const

const DEFAULT_SWEEP_LIMIT = 50
const MAX_SWEEP_LIMIT = 500

export interface RelinkReport {
  userId: string
  dryRun: boolean
  activeWabaIds: string[]
  /** Rencana (dryRun) atau yang benar-benar diterapkan. */
  changes: RelinkChange[]
  unresolved: RelinkUnresolved[]
  /** Rencana yang batal diterapkan karena baris berubah di tengah jalan. */
  conflicts: string[]
  note?: string
}

/** WABA aktif user — urut sesi terbaru dulu. */
export async function listActiveWabaIds(userId: string): Promise<string[]> {
  const sessions = await prisma.whatsappSession.findMany({
    where: {
      userId,
      provider: 'CLOUD_API',
      status: 'CONNECTED',
      isActive: true,
      wabaId: { not: null },
    },
    select: { wabaId: true },
    orderBy: { updatedAt: 'desc' },
  })
  const ids = sessions.map((s) => s.wabaId).filter((w): w is string => Boolean(w))
  return [...new Set(ids)]
}

function starterMapFor(purposeKey: string): readonly string[] | null {
  return STARTER_TEMPLATES.find((d) => d.purposeKey === purposeKey)?.metaParamMap ?? null
}

async function loadCandidates(
  activeWabaIds: string[],
  linked: MetaTemplateLite[],
): Promise<MetaTemplateLite[]> {
  const purposeKeys = [...new Set(linked.map((t) => t.purposeKey).filter((k): k is string => Boolean(k)))]
  const names = [...new Set(linked.map((t) => t.name))]
  return prisma.wabaTemplate.findMany({
    where: {
      wabaId: { in: activeWabaIds },
      OR: [{ purposeKey: { in: purposeKeys } }, { name: { in: names } }],
    },
    select: META_LITE_SELECT,
  })
}

async function applyChange(change: RelinkChange): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const r = await tx.followUpTemplate.updateMany({
      where: { id: change.followUpTemplateId, metaTemplateId: change.from.id },
      data: { metaTemplateId: change.to.id, metaParamMap: change.paramMap },
    })
    if (r.count === 0) return false
    await tx.followUpQueue.updateMany({
      where: { templateId: change.followUpTemplateId, status: 'PENDING' },
      data: { resolvedParams: Prisma.DbNull },
    })
    return true
  })
}

export async function relinkStaleFollowUpTemplates(
  userId: string,
  opts: { dryRun?: boolean } = {},
): Promise<RelinkReport> {
  const dryRun = opts.dryRun ?? false
  const base: RelinkReport = { userId, dryRun, activeWabaIds: [], changes: [], unresolved: [], conflicts: [] }

  const activeWabaIds = await listActiveWabaIds(userId)
  if (activeWabaIds.length === 0) {
    return { ...base, note: 'Tidak ada WABA aktif (sesi Cloud API CONNECTED) — tidak ada perubahan' }
  }

  const rows = await prisma.followUpTemplate.findMany({
    where: { userId, metaTemplateId: { not: null } },
    select: { id: true, name: true, metaParamMap: true, metaTemplate: { select: META_LITE_SELECT } },
  })
  const linked: MetaTemplateLite[] = rows.flatMap((r) => (r.metaTemplate ? [r.metaTemplate] : []))
  const candidates = linked.length > 0 ? await loadCandidates(activeWabaIds, linked) : []
  const plan = planRelinks({ followUps: rows, candidates, activeWabaIds, starterMapFor })

  if (dryRun) return { ...base, activeWabaIds, ...plan }

  const applied: RelinkChange[] = []
  const conflicts: string[] = []
  for (const change of plan.changes) {
    const ok = await applyChange(change)
    if (ok) applied.push(change)
    else conflicts.push(change.followUpTemplateId)
  }
  if (applied.length > 0) {
    console.log(`[followup-relink] user ${userId}: ${applied.length} follow-up ditautkan ulang`)
  }
  return { ...base, activeWabaIds, changes: applied, unresolved: plan.unresolved, conflicts }
}

/** Versi best-effort untuk hook (route/cron/webhook) — NEVER throw. */
export async function relinkStaleFollowUpTemplatesSafe(userId: string, source: string): Promise<number> {
  try {
    const r = await relinkStaleFollowUpTemplates(userId)
    return r.changes.length
  } catch (err) {
    console.error(`[followup-relink] ${source}: relink user ${userId} gagal:`, err)
    return 0
  }
}

/** Relink untuk semua user pemilik sesi Cloud API dengan WABA ini. NEVER throw. */
export async function relinkForWaba(wabaId: string, source: string): Promise<number> {
  try {
    const sessions = await prisma.whatsappSession.findMany({
      where: { wabaId, provider: 'CLOUD_API' },
      select: { userId: true },
      distinct: ['userId'],
    })
    let total = 0
    for (const s of sessions) total += await relinkStaleFollowUpTemplatesSafe(s.userId, source)
    return total
  } catch (err) {
    console.error(`[followup-relink] ${source}: relink WABA ${wabaId} gagal:`, err)
    return 0
  }
}

export interface RelinkSweepReport {
  dryRun: boolean
  usersChecked: number
  changed: number
  unresolved: number
  /** Hanya user yang punya perubahan / tautan tak terselesaikan. */
  reports: RelinkReport[]
}

/** Sapu relink lintas user (cron followup-relink). */
export async function relinkSweep(
  opts: { userId?: string; dryRun?: boolean; limit?: number } = {},
): Promise<RelinkSweepReport> {
  const dryRun = opts.dryRun ?? false
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_SWEEP_LIMIT, 1), MAX_SWEEP_LIMIT)
  const userIds = opts.userId
    ? [opts.userId]
    : (
        await prisma.followUpTemplate.findMany({
          where: {
            metaTemplateId: { not: null },
            user: {
              waSessions: {
                some: { provider: 'CLOUD_API', status: 'CONNECTED', isActive: true, wabaId: { not: null } },
              },
            },
          },
          select: { userId: true },
          distinct: ['userId'],
          orderBy: { userId: 'asc' },
          take: limit,
        })
      ).map((r) => r.userId)

  const reports: RelinkReport[] = []
  for (const userId of userIds) {
    try {
      const r = await relinkStaleFollowUpTemplates(userId, { dryRun })
      if (r.changes.length > 0 || r.unresolved.length > 0 || r.conflicts.length > 0 || opts.userId) {
        reports.push(r)
      }
    } catch (err) {
      console.error(`[followup-relink] sweep user ${userId} gagal:`, err)
    }
  }
  return {
    dryRun,
    usersChecked: userIds.length,
    changed: reports.reduce((n, r) => n + r.changes.length, 0),
    unresolved: reports.reduce((n, r) => n + r.unresolved.length, 0),
    reports,
  }
}

/**
 * Setelah sesi Cloud API baru terhubung: tarik template WABA dari Meta lalu
 * relink follow-up user. NEVER throw (dipakai di after()).
 */
export async function syncTemplatesAndRelinkForSession(sessionId: string): Promise<void> {
  try {
    const s = await prisma.whatsappSession.findUnique({
      where: { id: sessionId },
      select: { userId: true, wabaId: true, provider: true },
    })
    if (!s || s.provider !== 'CLOUD_API' || !s.wabaId) return
    const sync = await syncTemplatesFromMeta({ wabaId: s.wabaId, userId: s.userId })
    if (!sync.ok) console.error(`[followup-relink] sync template sesi ${sessionId} gagal: ${sync.error}`)
    // Relink tetap jalan walau sync gagal — template lokal yang ada tetap berguna.
    await relinkStaleFollowUpTemplatesSafe(s.userId, `session ${sessionId}`)
  } catch (err) {
    console.error(`[followup-relink] syncTemplatesAndRelinkForSession ${sessionId} gagal:`, err)
  }
}
