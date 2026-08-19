// Import kontak coexistence (dari WA Business App) ke Contact hulao TANPA
// pesan. Aturan:
//   - lookup by userId+phoneNumber (kontak = milik user, lintas sesi)
//   - kontak baru dibuat via createMany skipDuplicates berkunci
//     [waSessionId, phoneNumber] (unique DB) → aman terhadap race antar-chunk
//   - nama diisi hanya bila kosong (jangan timpa editan CS)
//   - repin waSessionId ke sesi ini hanya bila sesi kontak lama NONAKTIF

import { prisma } from '@/lib/prisma'

export interface SyncedContactInput {
  /** digit murni */
  phone: string
  name?: string | null
}

export interface ResolvedContact {
  id: string
  phone: string
}

const CHUNK = 500

function uniqueByPhone(list: SyncedContactInput[]): SyncedContactInput[] {
  const seen = new Map<string, SyncedContactInput>()
  for (const c of list) {
    const phone = c.phone.replace(/\D/g, '')
    if (!phone) continue
    const prev = seen.get(phone)
    // Simpan nama pertama yang non-kosong.
    seen.set(phone, { phone, name: prev?.name || c.name || null })
  }
  return [...seen.values()]
}

/**
 * Pastikan Contact ada untuk tiap nomor; return peta phone → {id}.
 * `created` = jumlah kontak yang benar-benar baru dibuat.
 */
export async function importContacts(input: {
  userId: string
  sessionId: string
  contacts: SyncedContactInput[]
}): Promise<{ created: number; byPhone: Map<string, ResolvedContact> }> {
  const byPhone = new Map<string, ResolvedContact>()
  const wanted = uniqueByPhone(input.contacts)
  if (wanted.length === 0) return { created: 0, byPhone }

  let created = 0
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const slice = wanted.slice(i, i + CHUNK)
    const phones = slice.map((c) => c.phone)

    const existing = await prisma.contact.findMany({
      where: { userId: input.userId, phoneNumber: { in: phones } },
      select: {
        id: true,
        phoneNumber: true,
        name: true,
        waSessionId: true,
        lastMessageAt: true,
        waSession: { select: { isActive: true } },
      },
    })

    // Pilih satu kontak per nomor: sesi ini → sesi aktif lain → paling baru.
    const chosen = new Map<string, (typeof existing)[number]>()
    for (const c of existing) {
      const prev = chosen.get(c.phoneNumber)
      if (!prev) {
        chosen.set(c.phoneNumber, c)
        continue
      }
      const score = (x: (typeof existing)[number]) =>
        x.waSessionId === input.sessionId ? 3 : x.waSession.isActive ? 2 : 1
      const better =
        score(c) > score(prev) ||
        (score(c) === score(prev) &&
          (c.lastMessageAt?.getTime() ?? 0) > (prev.lastMessageAt?.getTime() ?? 0))
      if (better) chosen.set(c.phoneNumber, c)
    }

    // Kontak yang belum ada → buat.
    const missing = slice.filter((c) => !chosen.has(c.phone))
    if (missing.length > 0) {
      const res = await prisma.contact.createMany({
        data: missing.map((c) => ({
          userId: input.userId,
          waSessionId: input.sessionId,
          phoneNumber: c.phone,
          name: c.name ?? null,
        })),
        skipDuplicates: true,
      })
      created += res.count
      const fresh = await prisma.contact.findMany({
        where: { userId: input.userId, phoneNumber: { in: missing.map((c) => c.phone) } },
        select: { id: true, phoneNumber: true },
      })
      for (const c of fresh) byPhone.set(c.phoneNumber, { id: c.id, phone: c.phoneNumber })
    }

    // Kontak existing → isi nama bila kosong, repin bila sesi lama nonaktif.
    for (const c of chosen.values()) {
      byPhone.set(c.phoneNumber, { id: c.id, phone: c.phoneNumber })
      const incomingName = slice.find((x) => x.phone === c.phoneNumber)?.name ?? null
      const data: { name?: string; waSessionId?: string } = {}
      if (!c.name && incomingName) data.name = incomingName
      if (c.waSessionId !== input.sessionId && !c.waSession.isActive) {
        data.waSessionId = input.sessionId
      }
      if (Object.keys(data).length > 0) {
        await prisma.contact
          .update({ where: { id: c.id }, data })
          .catch(() => undefined) // unique [waSessionId, phoneNumber] bentrok → biarkan
      }
    }
  }

  return { created, byPhone }
}
