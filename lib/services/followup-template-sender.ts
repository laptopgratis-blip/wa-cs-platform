// "Kirim dari" per template follow-up (2026-11-25) — aturan + pemuat.
//
// Seller mengunci nomor WA pengirim di template follow-up
// (FollowUpTemplate.senderSessionId). Beda dengan CS WhatsApp per produk
// (lib/services/orders/order-cs.ts) yang LUNAK, kunci di template ini KETAT:
// nomor offline → kiriman ditunda & dicoba ulang, TIDAK pindah ke nomor lain.
// Itulah inti permintaan seller (kasus ARLI 2026-11-25: satu order menerima
// dua welcome dari dua nomor berbeda karena failover diam-diam).
//
// Urutan pengirim follow-up: "Kirim dari" template → CS produk → nomor
// terakhir kontak → urutan kandidat lama (lib/wa-session.ts).
//
// Setiap scan ulang Baileys membuat baris WhatsappSession BARU, jadi id yang
// tersimpan bisa basi — dicocokkan ke kembaran bernomor sama milik user yang
// sama (resolveCsSender). "Hapus nomor" = soft-delete (isActive=false).

import { prisma } from '@/lib/prisma'
import {
  type CsSessionState,
  isCsSessionOnline,
  normalizeCsNumber,
  resolveCsSender,
} from '@/lib/services/orders/order-cs'
import type { SmartSendResult } from '@/lib/services/wa-send/smart-send'

export type TemplateSenderState =
  /** Template tidak mengunci nomor → perilaku lama. */
  | { kind: 'NONE' }
  /** Kirim HANYA dari sesi ini. */
  | { kind: 'ONLINE'; sessionId: string; number: string | null }
  /** Nomor masih terdaftar tapi belum terhubung → tunda (retry). */
  | { kind: 'OFFLINE'; number: string | null }
  /** Nomor sudah dihapus / bukan milik user → gagal permanen. */
  | { kind: 'REMOVED'; number: string | null }

export type PinnedSenderState = Exclude<TemplateSenderState, { kind: 'NONE' }>
export type UnavailableSenderState = Extract<
  TemplateSenderState,
  { kind: 'OFFLINE' | 'REMOVED' }
>

function digitsOf(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : ''
}

/**
 * Tentukan pengirim untuk template yang mengunci nomor.
 * `senderSession` = baris tersimpan, SUDAH difilter milik user (null = tidak
 * ditemukan). `userSessions` = sesi BELUM dihapus milik user yang sama.
 */
export function decideTemplateSender(input: {
  senderSession: CsSessionState | null
  userSessions: readonly CsSessionState[]
}): PinnedSenderState {
  const { senderSession, userSessions } = input
  if (!senderSession) return { kind: 'REMOVED', number: null }

  const number = normalizeCsNumber(senderSession.phoneNumber)
  const resolved = resolveCsSender({ csSession: senderSession, userSessions })
  if (resolved.preferredSessionId) {
    return { kind: 'ONLINE', sessionId: resolved.preferredSessionId, number }
  }

  const digits = digitsOf(senderSession.phoneNumber)
  const stillRegistered =
    senderSession.isActive ||
    (digits !== '' &&
      userSessions.some(
        (s) =>
          s.id !== senderSession.id &&
          s.isActive &&
          digitsOf(s.phoneNumber) === digits,
      ))
  return stillRegistered
    ? { kind: 'OFFLINE', number }
    : { kind: 'REMOVED', number }
}

function numberLabel(number: string | null): string {
  return number ? `Nomor pengirim +${number}` : 'Nomor pengirim'
}

/**
 * Hasil gagal (bentuk SmartSendResult) saat nomor yang dikunci tidak bisa
 * dipakai. OFFLINE transien → cron mencoba ulang; REMOVED permanen → cron
 * langsung FAILED + notifikasi. Akhiran "— dicoba lagi otomatis" dibuang
 * kebijakan gagal saat percobaan habis (followup-failure-policy).
 */
export function templateSenderFailure(
  state: UnavailableSenderState,
): SmartSendResult {
  const who = numberLabel(state.number)
  if (state.kind === 'REMOVED') {
    const detail =
      `${who} (pengaturan "Kirim dari" template ini) sudah dihapus dari akun — ` +
      'pilih nomor lain di template follow-up ini'
    return {
      success: false,
      code: 'NO_SESSION',
      permanent: true,
      detail,
      error: detail,
      attempts: [],
    }
  }
  const detail =
    `${who} (pengaturan "Kirim dari" template ini) belum terhubung, jadi ` +
    'follow-up tidak dikirim dari nomor lain — dicoba lagi otomatis'
  return {
    success: false,
    code: 'NO_SESSION',
    permanent: false,
    detail,
    error: detail,
    attempts: [],
  }
}

// Konflik nomor ↔ Template Meta: aturan pure ada di followup-sender-options
// (dipakai juga modal klien). Diekspor ulang untuk pemanggil server.
export { senderLinkConflict } from '@/lib/services/followup-sender-options'

// ── Pemuat ──────────────────────────────────────────────────────────────

const SESSION_SELECT = {
  id: true,
  phoneNumber: true,
  status: true,
  isActive: true,
  updatedAt: true,
} as const

type SessionRow = CsSessionState & { updatedAt: Date }

// Sesi belum-dihapus milik satu user: praktis < 10. Batas hanya pengaman.
const MAX_ACTIVE_SESSIONS = 50

/** Potongan klien Prisma untuk loadTemplateSender — `prisma` memenuhinya. */
export interface TemplateSenderDb {
  whatsappSession: {
    findFirst(args: {
      where: { id: string; userId: string }
      select: typeof SESSION_SELECT
    }): PromiseLike<SessionRow | null>
    findMany(args: {
      where: { userId: string; isActive: true; phoneNumber: { not: null } }
      select: typeof SESSION_SELECT
      orderBy: { updatedAt: 'desc' }
      take: number
    }): PromiseLike<SessionRow[]>
  }
}

/** Potongan klien Prisma untuk loadTemplateSenderNumbers. */
export interface SenderNumbersDb {
  whatsappSession: {
    findMany(args: {
      where: { id: { in: string[] }; userId: string }
      select: { id: true; phoneNumber: true }
    }): PromiseLike<Array<{ id: string; phoneNumber: string | null }>>
  }
}

/**
 * Muat keadaan "Kirim dari" untuk satu template. Query minimal: tanpa kunci
 * → 0; sesi online → 1; basi/offline → 2. Error DB DILEMPAR — pemanggil
 * (sendQueueItem) mengubahnya jadi gagal transien, bukan pindah nomor.
 */
export async function loadTemplateSender(
  input: { userId: string; senderSessionId: string | null | undefined },
  db: TemplateSenderDb = prisma,
): Promise<TemplateSenderState> {
  if (!input.senderSessionId) return { kind: 'NONE' }

  const senderSession = await db.whatsappSession.findFirst({
    where: { id: input.senderSessionId, userId: input.userId },
    select: SESSION_SELECT,
  })
  if (senderSession && isCsSessionOnline(senderSession)) {
    return decideTemplateSender({ senderSession, userSessions: [] })
  }
  if (!senderSession) return decideTemplateSender({ senderSession: null, userSessions: [] })

  const userSessions = await db.whatsappSession.findMany({
    where: { userId: input.userId, isActive: true, phoneNumber: { not: null } },
    select: SESSION_SELECT,
    orderBy: { updatedAt: 'desc' },
    take: MAX_ACTIVE_SESSIONS,
  })
  return decideTemplateSender({ senderSession, userSessions })
}

/**
 * Nomor (digit) tiap sesi "Kirim dari" untuk variabel {wa_admin}: pesan yang
 * dikirim dari nomor X menyebut nomor X sebagai admin, bukan CS produk.
 * Hanya sesi milik `userId`; id tanpa nomor sah → null.
 */
export async function loadTemplateSenderNumbers(
  userId: string,
  sessionIds: ReadonlyArray<string | null | undefined>,
  db: SenderNumbersDb = prisma,
): Promise<Map<string, string | null>> {
  const ids = [...new Set(sessionIds.filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return new Map()
  const rows = await db.whatsappSession.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true, phoneNumber: true },
  })
  return new Map(rows.map((r) => [r.id, normalizeCsNumber(r.phoneNumber)]))
}
