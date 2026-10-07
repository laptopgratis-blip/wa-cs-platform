// Impor kontak (hasil parse spreadsheet) ke SATU nomor WA milik user.
//
// Beda dengan importContacts coexistence (lib/services/waba/coex-contacts.ts):
//   - lookup per (waSessionId, phoneNumber) — kunci unique DB — BUKAN lintas
//     sesi. Kontak di nomor WA lain milik user tidak disentuh/di-repin sama
//     sekali (satu pelanggan ke dua nomor kita = dua baris Contact).
//   - kontak lama di sesi ini: hanya tag impor ditambahkan & nama diisi bila
//     kosong. Stage/blacklist/opt-out dibiarkan — broadcast sudah
//     mengecualikan blacklist & opt-out sendiri.
//
// Performa: 10.000 baris = 20 chunk × (findMany + createMany + updateMany +
// satu transaksi isi-nama). Tanpa N+1 untuk tag; isi nama dibatch per chunk.

import { prisma } from '@/lib/prisma'

import { planExistingContactUpdates } from './import-parse'

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
}

function chunked<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Jumlah nomor (dari daftar) yang sudah punya kontak di sesi ini. */
export async function countExistingInSession(input: {
  userId: string
  sessionId: string
  phones: string[]
}): Promise<number> {
  let total = 0
  for (const phones of chunked(input.phones, CHUNK)) {
    total += await prisma.contact.count({
      where: { userId: input.userId, waSessionId: input.sessionId, phoneNumber: { in: phones } },
    })
  }
  return total
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
  const created =
    missing.length > 0
      ? (
          await prisma.contact.createMany({
            data: missing.map((c) => ({
              ...scope,
              phoneNumber: c.phone,
              name: c.name,
              tags: [input.tag],
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

  return { created, updatedExisting: plan.updatedExisting, alreadyTagged: plan.alreadyTagged }
}

/** Impor kontak ke satu sesi WA. Pemanggil wajib memastikan sesi milik user. */
export async function importContactsForSession(input: {
  userId: string
  sessionId: string
  contacts: ImportContactInput[]
  tag: string
}): Promise<ImportContactsResult> {
  let total: ImportContactsResult = { created: 0, updatedExisting: 0, alreadyTagged: 0 }
  for (const slice of chunked(input.contacts, CHUNK)) {
    const r = await importChunk(input, slice)
    total = {
      created: total.created + r.created,
      updatedExisting: total.updatedExisting + r.updatedExisting,
      alreadyTagged: total.alreadyTagged + r.alreadyTagged,
    }
  }
  return total
}
