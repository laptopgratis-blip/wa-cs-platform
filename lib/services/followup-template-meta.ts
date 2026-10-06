// Tautan Template Meta pada API follow-up (POST/PATCH/GET
// /api/followup/templates). Server-only: verifikasi kepemilikan template +
// validasi peta {{n}} (followup-meta-link.validateFollowUpMetaLink) + ringkasan
// template tertaut & masalahnya untuk UI.

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import {
  followUpLinkIssue,
  validateFollowUpMetaLink,
  type FollowUpLinkIssue,
} from '@/lib/services/followup-meta-link'
import { listActiveWabaIds } from '@/lib/services/followup-meta-relink'

export interface MetaLinkData {
  metaTemplateId: string | null
  metaParamMap: string[] | typeof Prisma.DbNull
}

export type MetaLinkResolution =
  | { ok: true; data: MetaLinkData | null } // null = tautan tidak berubah
  | { ok: false; status: 400 | 404; error: string }

const VALIDATE_SELECT = {
  id: true,
  name: true,
  language: true,
  category: true,
  status: true,
  headerType: true,
  headerText: true,
  headerMediaUrl: true,
  bodyText: true,
  buttons: true,
} as const

export interface MetaLinkInput {
  userId: string
  /** Trigger efektif setelah update. */
  trigger: string
  /** undefined = tidak dikirim (tidak diubah). */
  metaTemplateId: string | null | undefined
  metaParamMap: string[] | null | undefined
  existing?: { metaTemplateId: string | null; metaParamMap: unknown; trigger: string } | null
}

function existingMap(raw: unknown): string[] | null {
  return Array.isArray(raw) && raw.every((v) => typeof v === 'string') ? (raw as string[]) : null
}

/**
 * Hitung nilai metaTemplateId/metaParamMap yang akan disimpan. Validasi hanya
 * jalan bila tautan/peta dikirim, atau trigger berubah pada follow-up yang
 * sudah tertaut (placeholder sah bergantung trigger).
 */
export async function resolveMetaLinkInput(input: MetaLinkInput): Promise<MetaLinkResolution> {
  const { existing } = input
  const triggerChanged = Boolean(existing?.metaTemplateId) && existing?.trigger !== input.trigger
  const touched = input.metaTemplateId !== undefined || input.metaParamMap !== undefined || triggerChanged
  if (!touched) return { ok: true, data: null }

  const metaTemplateId =
    input.metaTemplateId !== undefined ? input.metaTemplateId : (existing?.metaTemplateId ?? null)
  if (!metaTemplateId) {
    return { ok: true, data: { metaTemplateId: null, metaParamMap: Prisma.DbNull } }
  }

  const template = await prisma.wabaTemplate.findFirst({
    where: { id: metaTemplateId, userId: input.userId },
    select: VALIDATE_SELECT,
  })
  if (!template) return { ok: false, status: 404, error: 'Template Meta tidak ditemukan' }

  const paramMap =
    input.metaParamMap !== undefined ? input.metaParamMap : existingMap(existing?.metaParamMap)
  const v = validateFollowUpMetaLink({ template, paramMap, trigger: input.trigger })
  if (!v.ok) return { ok: false, status: 400, error: v.error }
  return { ok: true, data: { metaTemplateId, metaParamMap: v.paramMap } }
}

export const META_SUMMARY_SELECT = {
  id: true,
  name: true,
  language: true,
  status: true,
  wabaId: true,
  category: true,
} as const

/** Masalah tautan per follow-up terhadap WABA aktif user (untuk badge UI). */
export async function metaIssueResolver(
  userId: string,
): Promise<(t: { wabaId: string; status: string } | null) => FollowUpLinkIssue | null> {
  const activeWabaIds = await listActiveWabaIds(userId)
  return (t) => followUpLinkIssue(t, activeWabaIds)
}
