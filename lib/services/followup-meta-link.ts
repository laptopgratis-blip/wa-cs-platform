// Tautan FollowUpTemplate ⇄ WabaTemplate (template Meta) — PURE (tanpa prisma).
//
// Masalah yang ditangani: seller ganti nomor/WABA → follow-up masih tertaut
// ke template WABA lama sehingga tidak bisa dipakai. Modul ini menilai tautan
// (followUpLinkIssue), memilih padanan di WABA aktif (pickRelinkTarget), dan
// menyusun rencana relink (planRelinks). Eksekusi DB ada di
// followup-meta-relink.ts. Tidak pernah submit template ke Meta.

import { allowedPlaceholdersForTrigger } from '@/lib/services/followup-placeholders'
import {
  buildSendComponents,
  expectedBodyParamCount,
  preflightSendParams,
  type TemplateLike,
} from '@/lib/services/waba/template-payload'

export interface MetaTemplateLite {
  id: string
  userId: string
  wabaId: string
  status: string
  purposeKey: string | null
  name: string
  language: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  bodyText: string
}

/** Status yang tidak akan pernah bisa dipakai kirim (tanpa template baru). */
export const UNUSABLE_TEMPLATE_STATUSES: readonly string[] = ['DELETED', 'REJECTED', 'DISABLED']

export type FollowUpLinkIssue = 'WABA_INACTIVE' | 'TEMPLATE_UNUSABLE'

export const LINK_ISSUE_LABEL: Record<FollowUpLinkIssue, string> = {
  WABA_INACTIVE: 'template milik WABA yang tidak aktif (nomor lama?)',
  TEMPLATE_UNUSABLE: 'template dihapus/ditolak/dinonaktifkan Meta',
}

/**
 * Nilai tautan terhadap WABA aktif user. Tanpa WABA aktif, perpindahan WABA
 * tidak bisa dinilai (null) — kecuali template-nya memang sudah tak terpakai.
 */
export function followUpLinkIssue(
  link: { wabaId: string; status: string } | null,
  activeWabaIds: readonly string[],
): FollowUpLinkIssue | null {
  if (!link) return null
  if (UNUSABLE_TEMPLATE_STATUSES.includes(link.status)) return 'TEMPLATE_UNUSABLE'
  if (activeWabaIds.length > 0 && !activeWabaIds.includes(link.wabaId)) return 'WABA_INACTIVE'
  return null
}

// Semakin kecil semakin baik. Status di luar daftar = tidak boleh dipilih.
const STATUS_RANK: Record<string, number> = {
  APPROVED: 0,
  PENDING: 1,
  IN_APPEAL: 1,
  PAUSED: 2,
  DRAFT: 3,
}

export function relinkStatusRank(status: string): number | null {
  return STATUS_RANK[status] ?? null
}

export type RelinkPick =
  | { ok: true; target: MetaTemplateLite; via: 'PURPOSE' | 'NAME' }
  | { ok: false; reason: string }

function bestByRank(
  list: MetaTemplateLite[],
  activeWabaIds: readonly string[],
): MetaTemplateLite | null {
  const ranked = list
    .map((t) => ({ t, rank: relinkStatusRank(t.status) }))
    .filter((x): x is { t: MetaTemplateLite; rank: number } => x.rank !== null)
    .sort(
      (a, b) =>
        a.rank - b.rank || activeWabaIds.indexOf(a.t.wabaId) - activeWabaIds.indexOf(b.t.wabaId),
    )
  return ranked[0]?.t ?? null
}

/**
 * Padanan template `current` di WABA aktif: purposeKey dulu, lalu
 * name+language (pemilik sama). Jumlah variabel body WAJIB sama supaya peta
 * {{n}} follow-up tetap bermakna.
 */
export function pickRelinkTarget(
  current: MetaTemplateLite,
  candidates: readonly MetaTemplateLite[],
  activeWabaIds: readonly string[],
): RelinkPick {
  const expected = expectedBodyParamCount(current)
  const pool = candidates.filter(
    (t) => t.id !== current.id && activeWabaIds.includes(t.wabaId),
  )
  const byPurpose = current.purposeKey ? pool.filter((t) => t.purposeKey === current.purposeKey) : []
  const byName = pool.filter(
    (t) => t.name === current.name && t.language === current.language && t.userId === current.userId,
  )
  const sameCount = (t: MetaTemplateLite) => expectedBodyParamCount(t) === expected

  const purposeHit = bestByRank(byPurpose.filter(sameCount), activeWabaIds)
  if (purposeHit) return { ok: true, target: purposeHit, via: 'PURPOSE' }
  const nameHit = bestByRank(byName.filter(sameCount), activeWabaIds)
  if (nameHit) return { ok: true, target: nameHit, via: 'NAME' }

  const related = [...byPurpose, ...byName]
  const usableButMismatch = related.find(
    (t) => relinkStatusRank(t.status) !== null && !sameCount(t),
  )
  if (usableButMismatch) {
    return {
      ok: false,
      reason:
        `padanan "${usableButMismatch.name}" punya ${expectedBodyParamCount(usableButMismatch)} variabel, ` +
        `template lama ${expected} — pilih ulang manual`,
    }
  }
  if (related.length > 0) {
    return { ok: false, reason: 'padanan di WABA aktif dihapus/ditolak/dinonaktifkan Meta' }
  }
  return { ok: false, reason: 'tidak ada padanan (purposeKey / nama+bahasa) di WABA aktif' }
}

/** Peta {{n}} untuk target: pertahankan peta lama bila panjangnya cocok. */
export function planRelinkParamMap(input: {
  currentMap: unknown
  target: MetaTemplateLite
  starterMap?: readonly string[] | null
}): string[] | null {
  const n = expectedBodyParamCount(input.target)
  const current = input.currentMap
  if (Array.isArray(current) && current.length === n && current.every((v) => typeof v === 'string')) {
    return [...(current as string[])]
  }
  if (input.starterMap && input.starterMap.length === n) return [...input.starterMap]
  if (n === 0) return []
  return null
}

export interface RelinkFollowUpRow {
  id: string
  name: string
  metaParamMap: unknown
  metaTemplate: MetaTemplateLite | null
}

export interface RelinkTemplateRef {
  id: string
  name: string
  wabaId: string
  status: string
}

export interface RelinkChange {
  followUpTemplateId: string
  name: string
  from: RelinkTemplateRef
  to: RelinkTemplateRef
  via: 'PURPOSE' | 'NAME'
  paramMap: string[]
  reason: string
}

export interface RelinkUnresolved {
  followUpTemplateId: string
  name: string
  from: RelinkTemplateRef
  reason: string
}

export interface RelinkPlan {
  changes: RelinkChange[]
  unresolved: RelinkUnresolved[]
}

function ref(t: MetaTemplateLite): RelinkTemplateRef {
  return { id: t.id, name: t.name, wabaId: t.wabaId, status: t.status }
}

export function planRelinks(input: {
  followUps: readonly RelinkFollowUpRow[]
  candidates: readonly MetaTemplateLite[]
  activeWabaIds: readonly string[]
  starterMapFor?: (purposeKey: string) => readonly string[] | null
}): RelinkPlan {
  const changes: RelinkChange[] = []
  const unresolved: RelinkUnresolved[] = []
  if (input.activeWabaIds.length === 0) return { changes, unresolved }

  for (const fu of input.followUps) {
    const current = fu.metaTemplate
    const issue = followUpLinkIssue(current, input.activeWabaIds)
    if (!current || !issue) continue

    const pick = pickRelinkTarget(current, input.candidates, input.activeWabaIds)
    if (!pick.ok) {
      unresolved.push({ followUpTemplateId: fu.id, name: fu.name, from: ref(current), reason: pick.reason })
      continue
    }
    const starterMap = pick.target.purposeKey ? input.starterMapFor?.(pick.target.purposeKey) : null
    const paramMap = planRelinkParamMap({ currentMap: fu.metaParamMap, target: pick.target, starterMap })
    if (!paramMap) {
      unresolved.push({
        followUpTemplateId: fu.id,
        name: fu.name,
        from: ref(current),
        reason: 'peta variabel lama tidak cocok dengan padanan — pilih ulang manual',
      })
      continue
    }
    changes.push({
      followUpTemplateId: fu.id,
      name: fu.name,
      from: ref(current),
      to: ref(pick.target),
      via: pick.via,
      paramMap,
      reason: `${LINK_ISSUE_LABEL[issue]}; padanan ${pick.via === 'PURPOSE' ? 'purposeKey' : 'nama+bahasa'}`,
    })
  }
  return { changes, unresolved }
}

// ── Validasi tautan yang dipilih seller (API POST/PATCH follow-up) ──

export type MetaLinkTemplate = TemplateLike & { status: string }

export const MAX_PARAM_ENTRY_CHARS = 64
// Token placeholder = apa pun di dalam kurung kurawal tunggal, mis. {nama}.
const TOKEN_RE = /\{[^{}]*\}/g

export type MetaLinkValidation =
  | { ok: true; paramMap: string[] }
  | { ok: false; error: string }

/** Cek dukungan via builder kirim asli: follow-up hanya mengirim param body. */
function unsupportedReason(template: MetaLinkTemplate, n: number): string | null {
  try {
    // Header media CDN Meta di-resolve jadi media id saat kirim → anggap tersedia.
    buildSendComponents(template, preflightSendParams(template, { body: Array.from({ length: n }, () => 'contoh') }))
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/**
 * Validasi entri peta {{n}}. Keputusan format: entri boleh token placeholder
 * (`{nama}`), teks literal, atau campuran (`Kak {nama}`) — semuanya di-resolve
 * oleh resolver yang sama dengan pesan bebas. Wajib tidak kosong, maks 64
 * karakter, dan setiap token harus placeholder sah untuk trigger.
 */
function entryError(entry: string, index: number, allowed: readonly string[]): string | null {
  const label = `Variabel {{${index + 1}}}`
  const value = entry.trim()
  if (!value) return `${label} belum dipilih`
  if (value.length > MAX_PARAM_ENTRY_CHARS) return `${label} maksimal ${MAX_PARAM_ENTRY_CHARS} karakter`
  const bad = (value.match(TOKEN_RE) ?? []).find((t) => !allowed.includes(t))
  if (bad) return `${label}: ${bad} tidak tersedia untuk trigger ini`
  return null
}

/**
 * Alasan template TIDAK bisa dipakai follow-up sama sekali (terlepas dari
 * peta variabel): AUTHENTICATION, status rusak, atau butuh parameter selain
 * body (header bervariabel, header media tanpa URL publik, tombol URL
 * bervariabel / salin kode). null = bisa dipakai. Dipakai juga oleh UI untuk
 * menonaktifkan pilihan.
 */
export function metaLinkTemplateError(template: MetaLinkTemplate): string | null {
  const label = `Template Meta "${template.name}"`
  if (template.category === 'AUTHENTICATION') {
    return 'Template AUTHENTICATION (OTP) tidak bisa dipakai untuk follow-up'
  }
  if (UNUSABLE_TEMPLATE_STATUSES.includes(template.status)) {
    return `${label} berstatus ${template.status} — pilih template lain`
  }
  const unsupported = unsupportedReason(template, expectedBodyParamCount(template))
  return unsupported ? `${label} tidak didukung follow-up: ${unsupported}` : null
}

export function validateFollowUpMetaLink(input: {
  template: MetaLinkTemplate
  paramMap: readonly string[] | null | undefined
  trigger: string
}): MetaLinkValidation {
  const { template } = input
  const templateError = metaLinkTemplateError(template)
  if (templateError) return { ok: false, error: templateError }

  const n = expectedBodyParamCount(template)
  const map = input.paramMap ?? []
  if (map.length !== n) {
    return {
      ok: false,
      error: `Template Meta "${template.name}" punya ${n} variabel — isi tepat ${n} pemetaan (diberikan ${map.length})`,
    }
  }
  const allowed = allowedPlaceholdersForTrigger(input.trigger)
  for (const [i, entry] of map.entries()) {
    const err = entryError(entry, i, allowed)
    if (err) return { ok: false, error: err }
  }
  return { ok: true, paramMap: map.map((e) => e.trim()) }
}
