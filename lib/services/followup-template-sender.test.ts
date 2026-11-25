// Uji "Kirim dari" per template follow-up: keputusan pengirim (pure), pesan
// gagal untuk cron, konflik nomor ↔ Template Meta, dan pemuat dengan tiruan
// database (tanpa Postgres). `npm test`.
import assert from 'node:assert/strict'

import {
  type SenderNumbersDb,
  type TemplateSenderDb,
  decideTemplateSender,
  loadTemplateSender,
  loadTemplateSenderNumbers,
  senderLinkConflict,
  templateSenderFailure,
} from './followup-template-sender'

let passed = 0
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

interface FakeSession {
  id: string
  userId: string
  phoneNumber: string | null
  status: 'CONNECTED' | 'DISCONNECTED' | 'PAUSED' | 'WAITING_QR'
  isActive: boolean
  updatedAt: Date
}

const session = (o: Partial<FakeSession> & { id: string }): FakeSession => ({
  userId: 'u1',
  phoneNumber: '6285173055884',
  status: 'CONNECTED',
  isActive: true,
  updatedAt: new Date('2026-11-01T00:00:00Z'),
  ...o,
})

function fakeDb(sessions: FakeSession[], opts: { failOn?: string } = {}) {
  const calls: string[] = []
  const db: TemplateSenderDb = {
    whatsappSession: {
      async findFirst({ where }) {
        calls.push('findFirst')
        if (opts.failOn === 'findFirst') throw new Error('db down')
        return (
          sessions.find((s) => s.id === where.id && s.userId === where.userId) ??
          null
        )
      },
      async findMany({ where }) {
        calls.push('findMany')
        return sessions.filter(
          (s) => s.userId === where.userId && s.isActive && s.phoneNumber !== null,
        )
      },
    },
  }
  const numbersDb: SenderNumbersDb = {
    whatsappSession: {
      async findMany({ where }) {
        calls.push('findMany')
        return sessions
          .filter((s) => where.id.in.includes(s.id) && s.userId === where.userId)
          .map((s) => ({ id: s.id, phoneNumber: s.phoneNumber }))
      },
    },
  }
  return { db, numbersDb, calls }
}

async function main(): Promise<void> {
  console.log('followup-template-sender')

  // ── decideTemplateSender (pure) ──
  await check('sesi tersimpan CONNECTED & aktif → ONLINE dengan id itu', () => {
    const s = session({ id: 's1' })
    assert.deepEqual(decideTemplateSender({ senderSession: s, userSessions: [] }), {
      kind: 'ONLINE',
      sessionId: 's1',
      number: '6285173055884',
    })
  })

  await check('id basi (scan ulang) → ONLINE lewat kembaran bernomor sama', () => {
    const stale = session({ id: 'old', status: 'DISCONNECTED', isActive: false })
    const twin = session({ id: 'new' })
    const r = decideTemplateSender({ senderSession: stale, userSessions: [twin] })
    assert.deepEqual(r, { kind: 'ONLINE', sessionId: 'new', number: '6285173055884' })
  })

  await check('nomor masih terdaftar tapi belum terhubung → OFFLINE (tunda, bukan pindah nomor)', () => {
    const paused = session({ id: 's1', status: 'PAUSED' })
    assert.deepEqual(decideTemplateSender({ senderSession: paused, userSessions: [paused] }), {
      kind: 'OFFLINE',
      number: '6285173055884',
    })
  })

  await check('baris basi + baris senomor terdaftar tapi offline → OFFLINE', () => {
    const stale = session({ id: 'old', status: 'DISCONNECTED', isActive: false })
    const waiting = session({ id: 'new', status: 'WAITING_QR' })
    assert.equal(
      decideTemplateSender({ senderSession: stale, userSessions: [waiting] }).kind,
      'OFFLINE',
    )
  })

  await check('nomor dihapus seller (semua baris isActive=false) → REMOVED', () => {
    const removed = session({ id: 's1', status: 'DISCONNECTED', isActive: false })
    assert.deepEqual(decideTemplateSender({ senderSession: removed, userSessions: [] }), {
      kind: 'REMOVED',
      number: '6285173055884',
    })
  })

  await check('sesi tidak ditemukan untuk user ini → REMOVED (tidak pernah pindah nomor)', () => {
    assert.deepEqual(decideTemplateSender({ senderSession: null, userSessions: [] }), {
      kind: 'REMOVED',
      number: null,
    })
  })

  await check('kembaran nomor lain tidak dipakai', () => {
    const stale = session({ id: 'old', status: 'DISCONNECTED', isActive: false })
    const other = session({ id: 'x', phoneNumber: '6285124988815' })
    assert.equal(
      decideTemplateSender({ senderSession: stale, userSessions: [other] }).kind,
      'REMOVED',
    )
  })

  // ── templateSenderFailure ──
  await check('OFFLINE → NO_SESSION transien, alasan menyebut nomor & dicoba lagi', () => {
    const f = templateSenderFailure({ kind: 'OFFLINE', number: '6285173055884' })
    assert.equal(f.success, false)
    assert.equal(f.code, 'NO_SESSION')
    assert.equal(f.permanent, false)
    assert.match(f.detail ?? '', /\+6285173055884/)
    assert.match(f.detail ?? '', /Kirim dari/)
    assert.match(f.detail ?? '', /dicoba lagi otomatis$/)
    assert.deepEqual(f.attempts, [])
  })

  await check('REMOVED → NO_SESSION permanen, minta pilih nomor lain', () => {
    const f = templateSenderFailure({ kind: 'REMOVED', number: '6285173055884' })
    assert.equal(f.code, 'NO_SESSION')
    assert.equal(f.permanent, true)
    assert.match(f.detail ?? '', /sudah dihapus/)
    assert.doesNotMatch(f.detail ?? '', /dicoba lagi/)
  })

  await check('REMOVED tanpa nomor → tetap kalimat utuh', () => {
    const f = templateSenderFailure({ kind: 'REMOVED', number: null })
    assert.match(f.detail ?? '', /^Nomor pengirim /)
    assert.doesNotMatch(f.detail ?? '', /null|undefined/)
  })

  // ── senderLinkConflict ──
  await check('tanpa nomor dikunci / tanpa Template Meta → tidak konflik', () => {
    assert.equal(senderLinkConflict(null, 'w1'), null)
    assert.equal(senderLinkConflict({ provider: 'CLOUD_API', wabaId: 'w1' }, null), null)
  })

  await check('Cloud API: Template Meta harus dari WABA nomor pengirim', () => {
    assert.equal(senderLinkConflict({ provider: 'CLOUD_API', wabaId: 'w1' }, 'w1'), null)
    assert.match(
      senderLinkConflict({ provider: 'CLOUD_API', wabaId: 'w1' }, 'w2') ?? '',
      /WABA/,
    )
  })

  await check('Cloud API tanpa WABA ID → konflik (template tidak bisa dipakai)', () => {
    assert.notEqual(senderLinkConflict({ provider: 'CLOUD_API', wabaId: null }, 'w1'), null)
  })

  await check('WhatsApp Web (Baileys) → Template Meta tidak dipakai, tidak konflik', () => {
    assert.equal(senderLinkConflict({ provider: 'BAILEYS', wabaId: null }, 'w1'), null)
  })

  // ── loadTemplateSender (tiruan DB) ──
  await check('tanpa senderSessionId → NONE tanpa query', async () => {
    const { db, calls } = fakeDb([])
    assert.deepEqual(await loadTemplateSender({ userId: 'u1', senderSessionId: null }, db), {
      kind: 'NONE',
    })
    assert.deepEqual(calls, [])
  })

  await check('sesi online → 1 query saja', async () => {
    const { db, calls } = fakeDb([session({ id: 's1' })])
    const r = await loadTemplateSender({ userId: 'u1', senderSessionId: 's1' }, db)
    assert.equal(r.kind, 'ONLINE')
    assert.deepEqual(calls, ['findFirst'])
  })

  await check('sesi milik user lain tidak bisa dipakai → REMOVED', async () => {
    const { db } = fakeDb([session({ id: 's1', userId: 'u2' })])
    const r = await loadTemplateSender({ userId: 'u1', senderSessionId: 's1' }, db)
    assert.equal(r.kind, 'REMOVED')
  })

  await check('id basi → cari kembaran milik user yang sama', async () => {
    const { db, calls } = fakeDb([
      session({ id: 'old', status: 'DISCONNECTED', isActive: false }),
      session({ id: 'new' }),
      session({ id: 'foreign', userId: 'u2' }),
    ])
    const r = await loadTemplateSender({ userId: 'u1', senderSessionId: 'old' }, db)
    assert.deepEqual(r, { kind: 'ONLINE', sessionId: 'new', number: '6285173055884' })
    assert.deepEqual(calls, ['findFirst', 'findMany'])
  })

  await check('error DB dilempar (pemanggil yang memutuskan retry)', async () => {
    const { db } = fakeDb([], { failOn: 'findFirst' })
    await assert.rejects(
      loadTemplateSender({ userId: 'u1', senderSessionId: 's1' }, db),
      /db down/,
    )
  })

  // ── loadTemplateSenderNumbers ({wa_admin}) ──
  await check('nomor per sesi untuk {wa_admin}, difilter milik user, unik', async () => {
    const { numbersDb, calls } = fakeDb([
      session({ id: 'a', phoneNumber: '+62 851-7305-5884' }),
      session({ id: 'b', phoneNumber: null }),
      session({ id: 'c', userId: 'u2' }),
    ])
    const map = await loadTemplateSenderNumbers('u1', ['a', 'b', 'c', 'a', null], numbersDb)
    assert.equal(map.get('a'), '6285173055884')
    assert.equal(map.get('b'), null)
    assert.equal(map.has('c'), false)
    assert.deepEqual(calls, ['findMany'])
  })

  await check('tanpa id → Map kosong tanpa query', async () => {
    const { numbersDb, calls } = fakeDb([])
    const map = await loadTemplateSenderNumbers('u1', [null, undefined], numbersDb)
    assert.equal(map.size, 0)
    assert.deepEqual(calls, [])
  })

  console.log(`followup-template-sender: ${passed} lulus`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
