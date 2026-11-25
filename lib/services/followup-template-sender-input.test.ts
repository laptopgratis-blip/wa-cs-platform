// Uji validasi "Kirim dari" di API template follow-up (POST/PATCH) dengan
// tiruan database: kepemilikan nomor, nomor terhapus/belum pernah pair, dan
// kecocokan WABA Template Meta. `npm test`.
import assert from 'node:assert/strict'

import {
  type SenderInputDb,
  resolveSenderInput,
} from './followup-template-sender-input'

let passed = 0
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

interface FakeSession {
  id: string
  userId: string
  provider: 'BAILEYS' | 'CLOUD_API'
  wabaId: string | null
  phoneNumber: string | null
  isActive: boolean
}

const BELLA: FakeSession = {
  id: 'bella',
  userId: 'u1',
  provider: 'CLOUD_API',
  wabaId: 'w-bella',
  phoneNumber: '6285173055884',
  isActive: true,
}
const ADIRA: FakeSession = { ...BELLA, id: 'adira', wabaId: 'w-adira', phoneNumber: '6285124988815' }
const WEB: FakeSession = { ...BELLA, id: 'web', provider: 'BAILEYS', wabaId: null, phoneNumber: '6281111111111' }
const REMOVED: FakeSession = { ...BELLA, id: 'gone', isActive: false }
const UNPAIRED: FakeSession = { ...WEB, id: 'unpaired', phoneNumber: null }
const FOREIGN: FakeSession = { ...BELLA, id: 'foreign', userId: 'u2' }

const TEMPLATES = [
  { id: 't-bella', userId: 'u1', wabaId: 'w-bella' },
  { id: 't-adira', userId: 'u1', wabaId: 'w-adira' },
]

function fakeDb() {
  const calls: string[] = []
  const sessions = [BELLA, ADIRA, WEB, REMOVED, UNPAIRED, FOREIGN]
  const db: SenderInputDb = {
    whatsappSession: {
      async findFirst({ where }) {
        calls.push('session')
        const s = sessions.find((x) => x.id === where.id && x.userId === where.userId)
        return s
          ? { id: s.id, provider: s.provider, wabaId: s.wabaId, phoneNumber: s.phoneNumber, isActive: s.isActive }
          : null
      },
    },
    wabaTemplate: {
      async findFirst({ where }) {
        calls.push('template')
        const t = TEMPLATES.find((x) => x.id === where.id && x.userId === where.userId)
        return t ? { wabaId: t.wabaId } : null
      },
    },
  }
  return { db, calls }
}

const base = { userId: 'u1', metaTemplateId: undefined }

async function main(): Promise<void> {
  console.log('followup-template-sender-input')

  await check('tidak dikirim & tautan tidak berubah → tidak berubah, tanpa query', async () => {
    const { db, calls } = fakeDb()
    const r = await resolveSenderInput({ ...base, senderSessionId: undefined }, db)
    assert.deepEqual(r, { ok: true, data: null })
    assert.deepEqual(calls, [])
  })

  await check('nilai sama dengan yang tersimpan → tidak divalidasi ulang', async () => {
    const { db, calls } = fakeDb()
    const r = await resolveSenderInput(
      { ...base, senderSessionId: 'gone', existing: { senderSessionId: 'gone', metaTemplateId: null } },
      db,
    )
    assert.deepEqual(r, { ok: true, data: null })
    assert.deepEqual(calls, [])
  })

  await check('null → kembali ke "ikuti CS produk"', async () => {
    const { db } = fakeDb()
    const r = await resolveSenderInput(
      { ...base, senderSessionId: null, existing: { senderSessionId: 'bella', metaTemplateId: 't-bella' } },
      db,
    )
    assert.deepEqual(r, { ok: true, data: { senderSessionId: null } })
  })

  await check('nomor milik user lain → 404', async () => {
    const { db } = fakeDb()
    const r = await resolveSenderInput({ ...base, senderSessionId: 'foreign' }, db)
    assert.equal(r.ok, false)
    assert.equal(!r.ok && r.status, 404)
  })

  await check('nomor sudah dihapus → 400', async () => {
    const { db } = fakeDb()
    const r = await resolveSenderInput({ ...base, senderSessionId: 'gone' }, db)
    assert.equal(!r.ok && r.status, 400)
    assert.match(!r.ok ? r.error : '', /dihapus/)
  })

  await check('sesi belum pernah tersambung (tanpa nomor) → 400', async () => {
    const { db } = fakeDb()
    const r = await resolveSenderInput({ ...base, senderSessionId: 'unpaired' }, db)
    assert.equal(!r.ok && r.status, 400)
  })

  await check('Cloud API + Template Meta WABA sendiri → ok', async () => {
    const { db } = fakeDb()
    const r = await resolveSenderInput({ userId: 'u1', senderSessionId: 'bella', metaTemplateId: 't-bella' }, db)
    assert.deepEqual(r, { ok: true, data: { senderSessionId: 'bella' } })
  })

  await check('ganti nomor ke Cloud lain tapi tautan lama WABA lain → 400', async () => {
    const { db } = fakeDb()
    const r = await resolveSenderInput(
      { ...base, senderSessionId: 'adira', existing: { senderSessionId: null, metaTemplateId: 't-bella' } },
      db,
    )
    assert.equal(!r.ok && r.status, 400)
    assert.match(!r.ok ? r.error : '', /WABA/)
  })

  await check('ganti tautan ke WABA lain saat nomor Cloud terkunci → 400', async () => {
    const { db } = fakeDb()
    const r = await resolveSenderInput(
      {
        userId: 'u1',
        senderSessionId: undefined,
        metaTemplateId: 't-adira',
        existing: { senderSessionId: 'bella', metaTemplateId: 't-bella' },
      },
      db,
    )
    assert.equal(!r.ok && r.status, 400)
  })

  await check('nomor WhatsApp Web + Template Meta apa pun → ok (template tidak dipakai)', async () => {
    const { db } = fakeDb()
    const r = await resolveSenderInput({ userId: 'u1', senderSessionId: 'web', metaTemplateId: 't-adira' }, db)
    assert.deepEqual(r, { ok: true, data: { senderSessionId: 'web' } })
  })

  await check('nomor terkunci yang kini terhapus tidak memblok ganti tautan (WABA sama)', async () => {
    const { db } = fakeDb()
    const r = await resolveSenderInput(
      {
        userId: 'u1',
        senderSessionId: undefined,
        metaTemplateId: 't-bella',
        existing: { senderSessionId: 'gone', metaTemplateId: null },
      },
      db,
    )
    assert.deepEqual(r, { ok: true, data: null })
  })

  await check('hapus tautan (null) tidak perlu cek WABA', async () => {
    const { db, calls } = fakeDb()
    const r = await resolveSenderInput(
      {
        userId: 'u1',
        senderSessionId: undefined,
        metaTemplateId: null,
        existing: { senderSessionId: 'bella', metaTemplateId: 't-adira' },
      },
      db,
    )
    assert.deepEqual(r, { ok: true, data: null })
    assert.deepEqual(calls, [])
  })

  console.log(`followup-template-sender-input: ${passed} lulus`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
