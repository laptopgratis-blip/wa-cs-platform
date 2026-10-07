// Impor kontak (hasil parse spreadsheet) ke SATU nomor WA milik user.
//
// Beda dengan importContacts coexistence (lib/services/waba/coex-contacts.ts):
//   - lookup per (waSessionId, phoneNumber) — kunci unique DB — BUKAN lintas
//     sesi. Kontak di nomor WA lain milik user tidak disentuh/di-repin sama
//     sekali (satu pelanggan ke dua nomor kita = dua baris Contact).
//   - kontak lama di sesi ini: hanya tag impor ditambahkan & nama diisi bila
//     kosong. Stage/blacklist/opt-out dibiarkan — broadcast sudah
//     mengecualikan blacklist & opt-out sendiri.
//   - kontak BARU mewarisi blacklist/opt-out nomor itu di sesi lain milik
//     user (broadcast memfilter per baris, tanpa cek lintas sesi).
//
// Performa: 10.000 baris = 20 chunk × (2 findMany + createMany + updateMany +
// satu transaksi isi-nama). Tanpa N+1 untuk tag; isi nama dibatch per chunk.

import { prisma } from '@/lib/prisma'

import {
  type ContactFlagRow,
  type SuppressionFlags,
  planExistingContactUpdates,
  summarizeSessionOverlap,
  suppressionFlagsFromOtherSessions,
} from './import-parse'

const CHUNK = 500

export interface ImportContactInput {
  /** Digit murni, sudah dinormalisasi & di-dedupe (buildImportPlan). */
  phone: string
  name: string | null
}

export interface ImportContactsResult {
  created: number
  updatedExisting: number
  alreadyTagged: number
  /** Kontak baru yang ikut ditandai blacklist/opt-out dari nomor lain. */
  suppressedFromOtherSessions: number
}

const FLAG_ROW_SELECT = {
  phoneNumber: true,
  waSessionId: true,
  isBlacklisted: true,
  marketingOptOut: true,
} as const

function chunked<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * Baris kontak user untuk nomor-nomor ini yang relevan bagi impor: yang di
 * sesi tujuan + yang di-blacklist/opt-out di sesi mana pun.
 */
async function loadFlagRows(
  input: { userId: string; sessionId: string },
  phones: string[],
): Promise<ContactFlagRow[]> {
  return prisma.contact.findMany({
    where: {
      userId: input.userId,
      phoneNumber: { in: phones },
      OR: [{ waSessionId: input.sessionId }, { isBlacklisted: true }, { marketingOptOut: true }],
    },
    select: FLAG_ROW_SELECT,
  })
}

/**
 * Pratinjau: jumlah nomor yang sudah punya kontak di sesi ini, dan nomor
 * baru yang diblokir/opt-out di nomor WA lain (akan ikut ditandai).
 */
export async function previewSessionOverlap(input: {
  userId: string
  sessionId: string
  phones: string[]
}): Promise<{ existingInSession: number; suppressedElsewhere: number }> {
  let existingInSession = 0
  let suppressedElsewhere = 0
  for (const phones of chunked(input.phones, CHUNK)) {
    const r = summarizeSessionOverlap(await loadFlagRows(input, phones), input.sessionId)
    existingInSession += r.existingInSession
    suppressedElsewhere += r.suppressedElsewhere
  }
  return { existingInSession, suppressedElsewhere }
}

async function importChunk(
  input: { userId: string; sessionId: string; tag: string },
  slice: ImportContactInput[],
): Promise<ImportContactsResult> {
  const phones = slice.map((c) => c.phone)
  const scope = { userId: input.userId, waSessionId: input.sessionId }

  const existing = await prisma.contact.findMany({
    where: { ...scope, phoneNumber: { in: phones } },
    select: { id: true, phoneNumber: true, name: true, tags: true },
  })
  const existingPhones = new Set(existing.map((c) => c.phoneNumber))

  // Kontak baru → createMany berkunci unique (waSessionId, phoneNumber);
  // skipDuplicates menelan race dengan pesan masuk yang membuat baris sama.
  const missing = slice.filter((c) => !existingPhones.has(c.phone))
  const flags =
    missing.length > 0
      ? suppressionFlagsFromOtherSessions(
          await loadFlagRows(input, missing.map((c) => c.phone)),
          input.sessionId,
        )
      : new Map<string, SuppressionFlags>()
  const created =
    missing.length > 0
      ? (
          await prisma.contact.createMany({
            data: missing.map((c) => ({
              ...scope,
              phoneNumber: c.phone,
              name: c.name,
              tags: [input.tag],
              ...(flags.get(c.phone) ?? {}),
            })),
            skipDuplicates: true,
          })
        ).count
      : 0

  const plan = planExistingContactUpdates(
    existing,
    new Map(slice.map((c) => [c.phone, c.name])),
    input.tag,
  )

  // Tag: satu updateMany untuk seluruh chunk. Filter ulang `NOT has tag`
  // (bukan daftar id) supaya baris yang lahir dari race di atas ikut bertag
  // dan tag tidak pernah dobel.
  if (plan.needTagIds.length > 0 || created < missing.length) {
    await prisma.contact.updateMany({
      where: { ...scope, phoneNumber: { in: phones }, NOT: { tags: { has: input.tag } } },
      data: { tags: { push: input.tag } },
    })
  }

  // Nama: hanya bila MASIH kosong saat update (CS bisa mengedit bersamaan).
  if (plan.nameFills.length > 0) {
    await prisma.$transaction(
      plan.nameFills.map((f) =>
        prisma.contact.updateMany({
          where: { id: f.id, OR: [{ name: null }, { name: '' }] },
          data: { name: f.name },
        }),
      ),
    )
  }

  return {
    created,
    updatedExisting: plan.updatedExisting,
    alreadyTagged: plan.alreadyTagged,
    suppressedFromOtherSessions: flags.size,
  }
}

/** Impor kontak ke satu sesi WA. Pemanggil wajib memastikan sesi milik user. */
export async function importContactsForSession(input: {
  userId: string
  sessionId: string
  contacts: ImportContactInput[]
  tag: string
}): Promise<ImportContactsResult> {
  let total: ImportContactsResult = {
    created: 0,
    updatedExisting: 0,
    alreadyTagged: 0,
    suppressedFromOtherSessions: 0,
  }
  for (const slice of chunked(input.contacts, CHUNK)) {
    const r = await importChunk(input, slice)
    total = {
      created: total.created + r.created,
      updatedExisting: total.updatedExisting + r.updatedExisting,
      alreadyTagged: total.alreadyTagged + r.alreadyTagged,
      suppressedFromOtherSessions: total.suppressedFromOtherSessions + r.suppressedFromOtherSessions,
    }
  }
  return total
}
