// Uji opsi "Kirim dari" di modal Template Follow-Up (pure). `npm test`.
import assert from 'node:assert/strict'

import {
  type FollowUpSenderRow,
  buildFollowUpSenderOptions,
  followUpSenderSummary,
  metaTemplatesForSender,
  senderTemplateWabaId,
} from './followup-sender-options'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const row = (o: Partial<FollowUpSenderRow> & { id: string }): FollowUpSenderRow => ({
  displayName: 'CS Arlikurnia (Bella)',
  phoneNumber: '6285173055884',
  provider: 'CLOUD_API',
  status: 'CONNECTED',
  isActive: true,
  wabaId: 'w-bella',
  updatedAt: new Date('2026-11-01T00:00:00Z'),
  ...o,
})

console.log('followup-sender-options')

check('wabaId ikut baris wakil nomor (bukan baris basi)', () => {
  const out = buildFollowUpSenderOptions(
    [
      row({ id: 'old', status: 'DISCONNECTED', isActive: false, wabaId: 'w-lama' }),
      row({ id: 'new', updatedAt: new Date('2026-11-20T00:00:00Z') }),
    ],
    [],
  )
  assert.equal(out.length, 1)
  assert.equal(out[0].id, 'new')
  assert.deepEqual(out[0].aliasIds, ['old'])
  assert.equal(out[0].wabaId, 'w-bella')
})

check('nomor WhatsApp Web → wabaId null', () => {
  const out = buildFollowUpSenderOptions(
    [row({ id: 'web', provider: 'BAILEYS', wabaId: null, phoneNumber: '6281111111111' })],
    [],
  )
  assert.equal(out[0].provider, 'BAILEYS')
  assert.equal(out[0].wabaId, null)
})

check('sesi tanpa nomor dibuang; nomor terhapus hanya bila dipakai', () => {
  const rows = [
    row({ id: 'unpaired', phoneNumber: null }),
    row({ id: 'gone', isActive: false, status: 'DISCONNECTED', phoneNumber: '6280000000000' }),
  ]
  assert.deepEqual(buildFollowUpSenderOptions(rows, []), [])
  const used = buildFollowUpSenderOptions(rows, ['gone'])
  assert.equal(used.length, 1)
  assert.equal(used[0].isRemoved, true)
})

check('ringkasan kartu: nama + nomor + keadaan', () => {
  const [online] = buildFollowUpSenderOptions([row({ id: 'b' })], [])
  assert.equal(followUpSenderSummary(online), 'Dikirim dari: CS Arlikurnia (Bella) (+6285173055884)')
  const [offline] = buildFollowUpSenderOptions([row({ id: 'b', status: 'PAUSED' })], [])
  assert.match(followUpSenderSummary(offline), / · offline$/)
  const [gone] = buildFollowUpSenderOptions(
    [row({ id: 'g', isActive: false, status: 'DISCONNECTED' })],
    ['g'],
  )
  assert.match(followUpSenderSummary(gone), / · sudah dihapus$/)
})

check('ringkasan tanpa displayName → nomor saja', () => {
  const [o] = buildFollowUpSenderOptions([row({ id: 'b', displayName: null })], [])
  assert.equal(followUpSenderSummary(o), 'Dikirim dari: +6285173055884')
})

check('senderTemplateWabaId: Cloud → WABA-nya; Web/tanpa nomor → null', () => {
  const [cloud] = buildFollowUpSenderOptions([row({ id: 'b' })], [])
  const [web] = buildFollowUpSenderOptions(
    [row({ id: 'w', provider: 'BAILEYS', wabaId: null, phoneNumber: '6281111111111' })],
    [],
  )
  assert.equal(senderTemplateWabaId(cloud), 'w-bella')
  assert.equal(senderTemplateWabaId(web), null)
  assert.equal(senderTemplateWabaId(null), null)
})

const T = (id: string, wabaId: string) => ({ id, wabaId })

check('tanpa kunci → hanya WABA yang punya sesi CONNECTED (perilaku lama) + tautan saat ini', () => {
  const out = metaTemplatesForSender([T('a', 'w1'), T('b', 'w2'), T('cur', 'w9')], {
    connectedWabaIds: ['w1'],
    senderWabaId: null,
    currentId: 'cur',
  })
  assert.deepEqual(out.map((t) => t.id), ['a', 'cur'])
})

check('nomor Cloud dikunci → WABA nomor itu walau sedang OFFLINE', () => {
  const out = metaTemplatesForSender([T('a', 'w1'), T('b', 'w2')], {
    connectedWabaIds: ['w1'],
    senderWabaId: 'w2',
    currentId: null,
  })
  assert.deepEqual(out.map((t) => t.id), ['b'])
})

check('nomor dikunci → tautan lama WABA lain tetap tampil (ditandai konflik di modal)', () => {
  const out = metaTemplatesForSender([T('a', 'w1'), T('b', 'w2')], {
    connectedWabaIds: ['w1', 'w2'],
    senderWabaId: 'w2',
    currentId: 'a',
  })
  assert.deepEqual(out.map((t) => t.id), ['a', 'b'])
})

console.log(`followup-sender-options: ${passed} lulus`)
