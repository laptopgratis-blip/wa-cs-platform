// Validasi "Kirim dari" pada API template follow-up (POST/PATCH
// /api/followup/templates). Server-only.
//
// - Nomor wajib milik user, pernah tersambung (punya nomor), dan belum
//   dihapus — hanya bila nilainya BERUBAH (edit field lain pada template yang
//   mengunci nomor yang kini terhapus tidak diblok; resolver kirim yang
//   menandai follow-up itu gagal + notifikasi).
// - Template Meta tertaut harus bisa dikirim dari nomor itu
//   (senderLinkConflict): dicek bila nomor ATAU tautan berubah.

import { prisma } from '@/lib/prisma'
import { senderLinkConflict } from '@/lib/services/followup-sender-options'

const SENDER_SELECT = {
  id: true,
  provider: true,
  wabaId: true,
  phoneNumber: true,
  isActive: true,
} as const

interface SenderRow {
  id: string
  provider: string
  wabaId: string | null
  phoneNumber: string | null
  isActive: boolean
}

/** Potongan klien Prisma yang dipakai di sini — `prisma` memenuhinya. */
export interface SenderInputDb {
  whatsappSession: {
    findFirst(args: {
      where: { id: string; userId: string }
      select: typeof SENDER_SELECT
    }): PromiseLike<SenderRow | null>
  }
  wabaTemplate: {
    findFirst(args: {
      where: { id: string; userId: string }
      select: { wabaId: true }
    }): PromiseLike<{ wabaId: string } | null>
  }
}

export interface SenderInput {
  userId: string
  /** undefined = tidak dikirim (tidak diubah); null = ikuti CS produk. */
  senderSessionId: string | null | undefined
  /** metaTemplateId baru setelah update; undefined = tautan tidak berubah. */
  metaTemplateId: string | null | undefined
  existing?: { senderSessionId: string | null; metaTemplateId: string | null } | null
}

export type SenderInputResolution =
  | { ok: true; data: { senderSessionId: string | null } | null } // null = tidak berubah
  | { ok: false; status: 400 | 404; error: string }

function rowError(row: SenderRow | null): { status: 400 | 404; error: string } | null {
  if (!row) return { status: 404, error: 'Nomor pengirim tidak ditemukan' }
  if (!row.phoneNumber) {
    return { status: 400, error: 'Nomor pengirim belum pernah tersambung — pilih nomor lain' }
  }
  if (!row.isActive) {
    return { status: 400, error: 'Nomor pengirim sudah dihapus dari akun — pilih nomor lain' }
  }
  return null
}

export async function resolveSenderInput(
  input: SenderInput,
  db: SenderInputDb = prisma,
): Promise<SenderInputResolution> {
  const { existing } = input
  const savedSender = existing?.senderSessionId ?? null
  const savedMeta = existing?.metaTemplateId ?? null
  const senderTouched =
    input.senderSessionId !== undefined && input.senderSessionId !== savedSender
  const linkTouched =
    input.metaTemplateId !== undefined && input.metaTemplateId !== savedMeta

  const senderId =
    input.senderSessionId !== undefined ? input.senderSessionId : savedSender
  const metaId = input.metaTemplateId !== undefined ? input.metaTemplateId : savedMeta
  const data = senderTouched ? { senderSessionId: senderId } : null

  if (!senderId) return { ok: true, data }
  if (!senderTouched && !(linkTouched && metaId)) return { ok: true, data }

  const row = await db.whatsappSession.findFirst({
    where: { id: senderId, userId: input.userId },
    select: SENDER_SELECT,
  })
  if (senderTouched) {
    const err = rowError(row)
    if (err) return { ok: false, ...err }
  }

  if (row && metaId) {
    const template = await db.wabaTemplate.findFirst({
      where: { id: metaId, userId: input.userId },
      select: { wabaId: true },
    })
    // Template tak ditemukan sudah ditolak resolveMetaLinkInput (404).
    const conflict = senderLinkConflict(row, template?.wabaId ?? null)
    if (conflict) return { ok: false, status: 400, error: conflict }
  }
  return { ok: true, data }
}
