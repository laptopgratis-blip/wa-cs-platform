// Uji lookup kontak "utamakan baris sesi pesan" (drain CS & status takeover).
// Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import { CONTACT_RECENCY_ORDER } from './recency'
import { findContactPreferSession, type ContactFindArgs } from './session-lookup'

let passed = 0
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

type Row = { id: string }

function fakeFinder(answers: (Row | null)[]) {
  const calls: ContactFindArgs[] = []
  const find = async (args: ContactFindArgs): Promise<Row | null> => {
    calls.push(args)
    return answers[calls.length - 1] ?? null
  }
  return { find, calls }
}

const key = { userId: 'u1', sessionId: 's-A', phoneNumber: '6281234567890' }

async function main(): Promise<void> {
  console.log('contacts/session-lookup')

  await check('baris di sesi pesan ada → dipakai, tanpa lookup lintas sesi', async () => {
    const f = fakeFinder([{ id: 'row-A' }])
    const row = await findContactPreferSession(f.find, key)
    assert.deepEqual(row, { id: 'row-A' })
    assert.equal(f.calls.length, 1)
    assert.deepEqual(f.calls[0], {
      where: { userId: 'u1', waSessionId: 's-A', phoneNumber: '6281234567890' },
    })
  })

  await check('tidak ada di sesi pesan → lintas sesi berurut recency (NULL di akhir)', async () => {
    // Kasus impor: baris impor (lastMessageAt NULL) di sesi lain TIDAK boleh
    // mengalahkan percakapan nyata yang sedang di-takeover CS.
    const f = fakeFinder([null, { id: 'row-X' }])
    const row = await findContactPreferSession(f.find, key)
    assert.deepEqual(row, { id: 'row-X' })
    assert.equal(f.calls.length, 2)
    assert.deepEqual(f.calls[1], {
      where: { userId: 'u1', phoneNumber: '6281234567890' },
      orderBy: CONTACT_RECENCY_ORDER,
    })
  })

  await check('tidak ada sama sekali → null', async () => {
    const f = fakeFinder([null, null])
    assert.equal(await findContactPreferSession(f.find, key), null)
  })

  console.log(`contacts/session-lookup: ${passed} lulus`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
