// Uji aturan murni generate klip background. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import {
  CLIP_STALE_EARLY_MS,
  CLIP_STALE_MS,
  classifyStaleClip,
  diffClipTransitions,
  isClipBusy,
  isClipInFlight,
  normalizeClipScript,
  shortClipLabel,
  shortErrorText,
  type StaleClipRow,
} from './clip-job-rules'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const NOW = Date.UTC(2026, 9, 22, 9, 0, 0)
const LATE = ['Kling lambat — video diproses di background.']
const stale = new Date(NOW - CLIP_STALE_MS - 1_000)
const fresh = new Date(NOW - 60_000)

function row(over: Partial<StaleClipRow>): StaleClipRow {
  return {
    status: 'GENERATING_VIDEO',
    klingJobId: null,
    errorMessage: null,
    videoUrl: null,
    updatedAt: stale,
    ...over,
  }
}

console.log('clip-job-rules')

check('isClipInFlight: status proses vs terminal', () => {
  for (const s of ['DRAFT', 'GENERATING_AUDIO', 'GENERATING_VIDEO', 'PROCESSING_EMBEDDING']) {
    assert.equal(isClipInFlight(s), true, s)
  }
  for (const s of ['READY', 'FAILED', 'ARCHIVED', '']) {
    assert.equal(isClipInFlight(s), false, s)
  }
})

check('normalizeClipScript: abaikan spasi & kapital', () => {
  assert.equal(
    normalizeClipScript('  Hai para ARMY,\n selamat   datang! '),
    normalizeClipScript('hai para army, selamat datang!'),
  )
  assert.notEqual(normalizeClipScript('Hai army'), normalizeClipScript('Hai armi'))
})

check('classifyStaleClip: klip sehat (baru bergerak) tidak disentuh', () => {
  assert.equal(classifyStaleClip(row({ updatedAt: fresh }), LATE, NOW), null)
})

check('classifyStaleClip: terminal tidak disentuh walau lama', () => {
  assert.equal(classifyStaleClip(row({ status: 'READY' }), LATE, NOW), null)
  assert.equal(classifyStaleClip(row({ status: 'FAILED' }), LATE, NOW), null)
})

check('classifyStaleClip: sudah bermarker cron → biarkan cron', () => {
  assert.equal(
    classifyStaleClip(row({ klingJobId: 'k1', errorMessage: LATE[0]! }), LATE, NOW),
    null,
  )
})

check('classifyStaleClip: task Kling tersubmit → HAND_OFF (tanpa submit ulang)', () => {
  assert.equal(classifyStaleClip(row({ klingJobId: 'k1' }), LATE, NOW), 'HAND_OFF')
})

check('classifyStaleClip: belum ada task Kling → FAILED', () => {
  assert.equal(classifyStaleClip(row({}), LATE, NOW), 'FAILED')
  assert.equal(classifyStaleClip(row({ status: 'DRAFT' }), LATE, NOW), 'FAILED')
  assert.equal(classifyStaleClip(row({ status: 'GENERATING_AUDIO' }), LATE, NOW), 'FAILED')
})

check('classifyStaleClip: embedding macet → READY kalau video ada', () => {
  assert.equal(
    classifyStaleClip(row({ status: 'PROCESSING_EMBEDDING', videoUrl: '/v.mp4' }), LATE, NOW),
    'READY',
  )
  assert.equal(classifyStaleClip(row({ status: 'PROCESSING_EMBEDDING' }), LATE, NOW), 'FAILED')
})

check('classifyStaleClip: batas tepat ambang dihitung macet', () => {
  const edgeEarly = new Date(NOW - CLIP_STALE_EARLY_MS)
  assert.equal(classifyStaleClip(row({ updatedAt: edgeEarly }), LATE, NOW), 'FAILED')
  const edgeLate = new Date(NOW - CLIP_STALE_MS)
  assert.equal(
    classifyStaleClip(row({ klingJobId: 'k1', updatedAt: edgeLate }), LATE, NOW),
    'HAND_OFF',
  )
})

check('classifyStaleClip: task Kling tersubmit diberi margin lebih lebar', () => {
  // 12 menit diam: tahap awal (tanpa task) sudah macet, tapi poll Kling +
  // download masih mungkin hidup → belum diserahkan ke cron.
  const twelveMin = new Date(NOW - 12 * 60_000)
  assert.equal(classifyStaleClip(row({ updatedAt: twelveMin }), LATE, NOW), 'FAILED')
  assert.equal(
    classifyStaleClip(row({ klingJobId: 'k1', updatedAt: twelveMin }), LATE, NOW),
    null,
  )
  assert.equal(
    classifyStaleClip(
      row({ status: 'PROCESSING_EMBEDDING', videoUrl: '/v.mp4', updatedAt: twelveMin }),
      LATE,
      NOW,
    ),
    null,
  )
})

check('isClipBusy: in-flight sehat / dipegang cron = sibuk; macet & terminal = bebas', () => {
  assert.equal(isClipBusy(row({ updatedAt: fresh }), LATE, NOW), true)
  assert.equal(
    isClipBusy(row({ klingJobId: 'k1', errorMessage: LATE[0]!, updatedAt: stale }), LATE, NOW),
    true,
  )
  assert.equal(isClipBusy(row({ updatedAt: stale }), LATE, NOW), false)
  assert.equal(isClipBusy(row({ status: 'FAILED', updatedAt: fresh }), LATE, NOW), false)
  assert.equal(isClipBusy(row({ status: 'READY', updatedAt: fresh }), LATE, NOW), false)
})

check('shortErrorText: potong pesan provider panjang, fallback ramah', () => {
  assert.equal(shortErrorText(null), 'silakan Retry')
  assert.equal(shortErrorText('  Audio gen:\n saldo kurang '), 'Audio gen: saldo kurang')
  const raw = `Kling failed: HTTP 502: <html>${'x'.repeat(500)}`
  const out = shortErrorText(raw)
  assert.equal(out.length, 121)
  assert.ok(out.endsWith('…'))
})

check('diffClipTransitions: in-flight → READY/FAILED dilaporkan', () => {
  const prev = new Map([
    ['a', 'GENERATING_VIDEO'],
    ['b', 'GENERATING_AUDIO'],
    ['c', 'GENERATING_VIDEO'],
  ])
  const out = diffClipTransitions(prev, [
    { id: 'a', status: 'READY', errorMessage: null, scriptOriginal: 'Halo' },
    { id: 'b', status: 'FAILED', errorMessage: 'Audio gen: x', scriptOriginal: 'Hai' },
    { id: 'c', status: 'GENERATING_VIDEO', errorMessage: null, scriptOriginal: 'Yo' },
  ])
  assert.deepEqual(
    out.map((t) => [t.id, t.outcome]),
    [
      ['a', 'READY'],
      ['b', 'FAILED'],
    ],
  )
  assert.equal(out[1]?.errorMessage, 'Audio gen: x')
})

check('diffClipTransitions: klip baru / sudah terminal sebelumnya → diam', () => {
  const prev = new Map([['a', 'READY']])
  const out = diffClipTransitions(prev, [
    { id: 'a', status: 'READY', errorMessage: null, scriptOriginal: 'Halo' },
    { id: 'z', status: 'READY', errorMessage: null, scriptOriginal: 'Baru' },
  ])
  assert.equal(out.length, 0)
})

check('shortClipLabel: potong rapi', () => {
  assert.equal(shortClipLabel('  Halo\n kak  '), 'Halo kak')
  const long = 'x'.repeat(60)
  assert.equal(shortClipLabel(long), `${'x'.repeat(40)}…`)
})

console.log(`clip-job-rules: ${passed} lulus`)
