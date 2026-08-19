// Pemilihan session WA yang BENAR-BENAR terhubung untuk mengirim pesan.
//
// Kontak di-pin ke `waSessionId` saat dibuat (unique [waSessionId, phoneNumber]).
// Setiap kali user scan QR / re-pair / WA ke-kick lalu connect lagi, baris
// WhatsappSession baru dibuat dengan id baru dan session lama jadi DISCONNECTED.
// Akibatnya MAYORITAS kontak lama nge-pin ke session yang sudah mati. Inbox
// `/send` dulu mengirim lewat `contact.waSessionId` mentah → wa-service balas
// "session belum siap" → balasan GAGAL terkirim padahal chat tetap tampil di
// inbox. Inilah bug "tidak bisa membalas ke nomor penerima tapi muncul di inbox".
//
// Aturan: pakai session kontak kalau memang masih CONNECTED (jaga konsistensi
// kalau user punya >1 nomor aktif); kalau tidak, fallback ke session CONNECTED
// milik user yang paling baru. null = user tidak punya session terhubung sama
// sekali (caller WAJIB gagalkan kirim dengan pesan jelas, bukan diam-diam).
//
// Trek 2B (dual provider): `listSenderCandidates` mengembalikan DAFTAR sesi
// terhubung beserta provider-nya — jalur non-CS (OTP/follow-up/notif) memakai
// `smartSend` yang mencoba kandidat berurutan (Baileys free-text → Cloud
// dalam window → Cloud template). Jangan lagi `findFirst({status:'CONNECTED'})`
// buta provider di pemanggil.
import type { WaProvider } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export async function resolveConnectedSessionId(
  userId: string,
  preferredSessionId: string | null | undefined,
): Promise<string | null> {
  if (preferredSessionId) {
    const pref = await prisma.whatsappSession.findFirst({
      where: { id: preferredSessionId, userId, status: 'CONNECTED' },
      select: { id: true },
    })
    if (pref) return pref.id
  }
  const live = await prisma.whatsappSession.findFirst({
    where: { userId, status: 'CONNECTED', isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  return live?.id ?? null
}

export interface SenderCandidate {
  sessionId: string
  userId: string
  provider: WaProvider
  wabaId: string | null
  phoneNumber: string | null
  label: string
}

const CANDIDATE_SELECT = {
  id: true,
  userId: true,
  provider: true,
  wabaId: true,
  phoneNumber: true,
  displayName: true,
  updatedAt: true,
} as const

type CandidateRow = {
  id: string
  userId: string
  provider: WaProvider
  wabaId: string | null
  phoneNumber: string | null
  displayName: string | null
  updatedAt: Date
}

function toCandidate(r: CandidateRow): SenderCandidate {
  return {
    sessionId: r.id,
    userId: r.userId,
    provider: r.provider,
    wabaId: r.wabaId,
    phoneNumber: r.phoneNumber,
    label: `${r.displayName ?? r.phoneNumber ?? r.id} (${r.provider === 'CLOUD_API' ? 'Cloud API' : 'Baileys'})`,
  }
}

/**
 * Daftar sesi pengirim yang CONNECTED & aktif, urut prioritas:
 * preferred → sesi yang terakhir bicara dengan nomor (Contact.waSessionId) →
 * Baileys (terbaru) → Cloud API (terbaru). Tanpa duplikat.
 */
export async function listSenderCandidates(input: {
  /** Sesi milik user ini. */
  userId?: string
  /** ID sesi eksplisit (mis. setting OTP_WA_SESSION_ID / env) — paling depan. */
  explicitSessionIds?: string[]
  /** Tambahkan sesi CONNECTED milik ADMIN (pool platform). */
  adminSessions?: boolean
  preferredSessionId?: string | null
  /** Nomor tujuan: sesi yang terakhir dipakai kontak ini didahulukan. */
  preferContactPhone?: string
}): Promise<SenderCandidate[]> {
  const ors: Array<Record<string, unknown>> = []
  if (input.explicitSessionIds?.length) ors.push({ id: { in: input.explicitSessionIds } })
  if (input.userId) ors.push({ userId: input.userId })
  if (input.adminSessions) ors.push({ user: { role: 'ADMIN' } })
  if (ors.length === 0) return []

  const rows = await prisma.whatsappSession.findMany({
    where: { status: 'CONNECTED', isActive: true, OR: ors },
    select: CANDIDATE_SELECT,
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })
  if (rows.length === 0) return []

  let contactSessionId: string | null = null
  if (input.preferContactPhone && input.userId) {
    const phone = input.preferContactPhone.replace(/\D/g, '')
    const c = await prisma.contact.findFirst({
      where: { userId: input.userId, phoneNumber: phone },
      select: { waSessionId: true },
      orderBy: { lastMessageAt: 'desc' },
    })
    contactSessionId = c?.waSessionId ?? null
  }

  const rank = (r: CandidateRow): number => {
    if (input.explicitSessionIds?.includes(r.id)) return 0
    if (input.preferredSessionId && r.id === input.preferredSessionId) return 1
    if (contactSessionId && r.id === contactSessionId) return 2
    return r.provider === 'BAILEYS' ? 3 : 4
  }
  const sorted = [...rows].sort((a, b) => {
    const d = rank(a) - rank(b)
    if (d !== 0) return d
    // explicit: ikuti urutan yang diminta pemanggil
    if (input.explicitSessionIds && rank(a) === 0) {
      return input.explicitSessionIds.indexOf(a.id) - input.explicitSessionIds.indexOf(b.id)
    }
    return b.updatedAt.getTime() - a.updatedAt.getTime()
  })
  return sorted.map(toCandidate)
}
