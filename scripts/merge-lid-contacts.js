#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// Migration script — fix kontak yang phoneNumber-nya masih dalam format @lid
// (privacy mode WA) ke nomor PN asli. LID adalah ID device-level yang opaque,
// kalau disimpan as-is akan bikin satu customer punya 2 entry kontak (LID +
// PN) saat customer matikan privacy mode.
//
// Cara kerja:
//   1. Cari semua Contact yang phoneNumber-nya mengandung '@lid'.
//   2. Group by waSessionId — Baileys cuma bisa resolve LID untuk session
//      yang punya mapping di credentialnya.
//   3. Per session, batch hit POST /lid/resolve di wa-service. Hasil PN
//      di-cache di memory.
//   4. Untuk tiap kontak yang berhasil di-resolve:
//        - Cek apakah ada Contact lain dengan { userId, phoneNumber: PN }.
//        - Kalau ADA → MERGE: pindah semua Message ke kontak PN, lalu hapus
//          kontak LID. Pertahankan field non-null dari kedua sisi.
//        - Kalau TIDAK ADA → update phoneNumber kontak LID jadi PN.
//   5. Idempotent — bisa dijalankan berulang. Skip kontak yang gagal resolve
//      (tetap LID) supaya bisa di-retry nanti.
//   6. Log ringkas ke /tmp/lid-merge-YYYYMMDD.log.
//
// Cara jalan (dari host):
//   docker exec hulao-nextjs node scripts/merge-lid-contacts.js
//
// Catatan: script ini perlu @prisma/client (sudah di node_modules image
// standalone karena di-import oleh app code) dan WA_SERVICE_URL +
// WA_SERVICE_SECRET dari env (sudah ada di .env.production).

const fs = require('node:fs')
const path = require('node:path')
const { PrismaClient } = require('@prisma/client')

const WA_SERVICE_URL =
  process.env.WA_SERVICE_URL || 'http://wa-service:3001'
const WA_SERVICE_SECRET = process.env.WA_SERVICE_SECRET || ''
const BATCH_SIZE = 50

// File log: /tmp/lid-merge-YYYYMMDD.log (per-day rotation).
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const LOG_PATH = path.join('/tmp', `lid-merge-${today}.log`)
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' })
function log(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.join(' ')}\n`
  logStream.write(line)
  process.stdout.write(line)
}

async function resolveLidsBulk(sessionId, lids) {
  if (lids.length === 0) return new Map()
  const headers = { 'content-type': 'application/json' }
  if (WA_SERVICE_SECRET) headers['x-service-secret'] = WA_SERVICE_SECRET
  const res = await fetch(`${WA_SERVICE_URL}/lid/resolve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionId, lids }),
  })
  if (!res.ok) {
    log(`  ✗ wa-service resolve gagal status ${res.status}`)
    return new Map()
  }
  const json = await res.json().catch(() => null)
  if (!json?.success || !Array.isArray(json.data?.results)) {
    log(`  ✗ wa-service resolve respons tidak valid`)
    return new Map()
  }
  const map = new Map()
  for (const item of json.data.results) {
    if (item?.lid && item.pn) map.set(item.lid, item.pn)
  }
  return map
}

async function mergeOrRename(prisma, lidContact, pn) {
  // Cari contact existing dengan PN yang sudah benar di user yang sama.
  const target = await prisma.contact.findFirst({
    where: { userId: lidContact.userId, phoneNumber: pn },
  })

  if (!target) {
    // Tidak ada duplikat — tinggal rename.
    await prisma.contact.update({
      where: { id: lidContact.id },
      data: { phoneNumber: pn },
    })
    log(`  ↻ rename contact ${lidContact.id} → ${pn}`)
    return { renamed: 1, merged: 0 }
  }

  if (target.id === lidContact.id) {
    // Same row — tidak harus terjadi karena lookup pakai phoneNumber=pn,
    // tapi safety net.
    return { renamed: 0, merged: 0 }
  }

  // Ada duplikat — merge dalam satu transaction supaya konsisten.
  await prisma.$transaction(async (tx) => {
    // Pindah semua Message dari LID-contact ke target.
    const moved = await tx.message.updateMany({
      where: { contactId: lidContact.id },
      data: { contactId: target.id },
    })
    log(
      `  ⇄ merge ${lidContact.id} → ${target.id} (${moved.count} pesan dipindah)`,
    )

    // Pindah OrderSession dan UserOrder juga supaya history utuh.
    await tx.orderSession
      .updateMany({
        where: { contactId: lidContact.id },
        data: { contactId: target.id },
      })
      .catch(() => {})
    await tx.userOrder
      .updateMany({
        where: { contactId: lidContact.id },
        data: { contactId: target.id },
      })
      .catch(() => {})

    // Pertahankan field non-null dari LID-contact kalau target masih kosong
    // (mis. nama dari pushName yang ke-cache di LID record duluan).
    const merged = {}
    if (!target.name && lidContact.name) merged.name = lidContact.name
    if (!target.avatar && lidContact.avatar) merged.avatar = lidContact.avatar
    if (!target.notes && lidContact.notes) merged.notes = lidContact.notes
    if (lidContact.tags?.length && (!target.tags || target.tags.length === 0)) {
      merged.tags = lidContact.tags
    }
    // lastMessageAt: ambil yang lebih baru.
    if (
      lidContact.lastMessageAt &&
      (!target.lastMessageAt ||
        lidContact.lastMessageAt > target.lastMessageAt)
    ) {
      merged.lastMessageAt = lidContact.lastMessageAt
    }
    if (Object.keys(merged).length > 0) {
      await tx.contact.update({ where: { id: target.id }, data: merged })
    }

    // Hapus LID-contact (FK Message sudah dipindah, jadi aman).
    await tx.contact.delete({ where: { id: lidContact.id } })
  })

  return { renamed: 0, merged: 1 }
}

async function main() {
  if (!WA_SERVICE_SECRET) {
    log('⚠ WA_SERVICE_SECRET kosong — request ke wa-service mungkin ditolak')
  }
  log(`Mulai migration. Log: ${LOG_PATH}`)
  const prisma = new PrismaClient()
  let totalRenamed = 0
  let totalMerged = 0
  let totalSkipped = 0
  try {
    // Ambil semua kontak LID. Filter di JS supaya filter `contains` postgres
    // gampang di-port kalau pindah DB (ekstra defensive — Prisma `contains`
    // sebenarnya juga jalan di Postgres).
    const lidContacts = await prisma.contact.findMany({
      where: { phoneNumber: { contains: '@lid' } },
    })
    log(`Ditemukan ${lidContacts.length} kontak dengan format @lid`)
    if (lidContacts.length === 0) {
      log('Selesai: tidak ada yang perlu di-merge.')
      return
    }

    // Group by waSessionId — wa-service resolve harus per session.
    const bySession = new Map()
    for (const c of lidContacts) {
      const arr = bySession.get(c.waSessionId) ?? []
      arr.push(c)
      bySession.set(c.waSessionId, arr)
    }

    for (const [sessionId, contacts] of bySession.entries()) {
      log(`\nSession ${sessionId} — ${contacts.length} kontak`)
      // Resolve dalam batch supaya request tidak terlalu besar.
      const lids = contacts.map((c) => c.phoneNumber)
      const resolved = new Map()
      for (let i = 0; i < lids.length; i += BATCH_SIZE) {
        const chunk = lids.slice(i, i + BATCH_SIZE)
        const partial = await resolveLidsBulk(sessionId, chunk)
        for (const [lid, pn] of partial.entries()) resolved.set(lid, pn)
      }

      for (const c of contacts) {
        const pn = resolved.get(c.phoneNumber)
        if (!pn) {
          log(`  · skip ${c.id} — LID belum bisa di-resolve`)
          totalSkipped++
          continue
        }
        try {
          const r = await mergeOrRename(prisma, c, pn)
          totalRenamed += r.renamed
          totalMerged += r.merged
        } catch (err) {
          log(`  ✗ gagal proses ${c.id}: ${err?.message || err}`)
          totalSkipped++
        }
      }
    }

    log(
      `\nSelesai. renamed=${totalRenamed} merged=${totalMerged} skipped=${totalSkipped}`,
    )
  } finally {
    await prisma.$disconnect().catch(() => {})
    logStream.end()
  }
}

main().catch((err) => {
  log(`FATAL: ${err?.stack || err}`)
  process.exitCode = 1
})
