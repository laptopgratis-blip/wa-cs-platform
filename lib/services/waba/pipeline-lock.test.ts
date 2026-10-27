// Uji lock per kontak jalur Cloud API (anti double-reply + drain + watchdog).
// Pipeline & penyimpanan ditiru; jam diinjeksi lewat `now`. Jalankan lewat
// `npm test`.
import assert from 'node:assert/strict'

import { type PipelineRunner, withContactLock } from './pipeline-lock'

let passed = 0
async function check(
  name: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const SESSION = 'sess-lock-test'
const TIMEOUT_MS = 120_000

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (err: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type RunResult = { shouldContinue: boolean }
const CONTINUE: RunResult = { shouldContinue: true }

interface RunCall {
  content: string
  skipSave: boolean
}

/**
 * Pipeline tiruan: konten yang terdaftar di `held` menunggu deferred-nya,
 * sisanya langsung selesai. Semua panggilan dicatat berurutan.
 */
function fakePipeline(held: Record<string, Deferred<RunResult>> = {}) {
  const calls: RunCall[] = []
  const saved: string[] = []
  const run: PipelineRunner = (content, opts) => {
    calls.push({ content, skipSave: opts.skipSave })
    return held[content]?.promise ?? Promise.resolve(CONTINUE)
  }
  const savePending = async (content: string): Promise<void> => {
    saved.push(content)
  }
  return { calls, saved, run, savePending }
}

function fakeClock(start = 0) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
  }
}

async function main(): Promise<void> {
  console.log('waba/pipeline-lock: withContactLock')

  await check(
    'burst pesan saat pipeline jalan → diantre & di-drain jadi satu putaran',
    async () => {
      const waId = 'wa-burst'
      const clock = fakeClock()
      const hold = deferred<RunResult>()
      const p = fakePipeline({ A: hold })
      const base = { sessionId: SESSION, waId, now: clock.now }
      const send = (content: string) =>
        withContactLock({
          ...base,
          content,
          externalId: `wamid-${content}`,
          run: p.run,
          savePending: p.savePending,
        })

      const runA = send('A')
      await send('P1')
      await send('P2')
      assert.deepEqual(p.saved, ['P1', 'P2'])
      assert.deepEqual(p.calls, [{ content: 'A', skipSave: false }])

      hold.resolve(CONTINUE)
      await runA
      assert.deepEqual(p.calls, [
        { content: 'A', skipSave: false },
        { content: 'P1\nP2', skipSave: true },
      ])

      // Lock bersih → pesan berikutnya langsung jalan.
      await send('B')
      assert.deepEqual(p.calls.at(-1), { content: 'B', skipSave: false })
    },
  )

  await check(
    'run basi selesai setelah watchdog → TIDAK menghapus lock run baru (pesan C diantre)',
    async () => {
      const waId = 'wa-stale-delete'
      const clock = fakeClock()
      const holdA = deferred<RunResult>()
      const holdB = deferred<RunResult>()
      const p = fakePipeline({ A: holdA, B: holdB })
      const send = (content: string) =>
        withContactLock({
          sessionId: SESSION,
          waId,
          now: clock.now,
          content,
          externalId: `wamid-${content}`,
          run: p.run,
          savePending: p.savePending,
        })

      const runA = send('A') // menggantung
      clock.advance(TIMEOUT_MS + 1_000)
      const runB = send('B') // watchdog rebut lock
      assert.deepEqual(
        p.calls.map((c) => c.content),
        ['A', 'B'],
      )

      holdA.resolve(CONTINUE) // run lama akhirnya selesai
      await runA

      clock.advance(1_000)
      await send('C') // B masih jalan → C wajib diantre
      assert.deepEqual(p.saved, ['C'], 'C harus disimpan sebagai antrian')
      assert.deepEqual(
        p.calls.map((c) => c.content),
        ['A', 'B'],
        'C tidak boleh memicu pipeline paralel saat B masih jalan',
      )

      holdB.resolve(CONTINUE)
      await runB
      assert.deepEqual(p.calls.at(-1), { content: 'C', skipSave: true })
      assert.equal(p.calls.length, 3)
    },
  )

  await check('run basi TIDAK men-drain antrian milik run baru', async () => {
    const waId = 'wa-stale-drain'
    const clock = fakeClock()
    const holdA = deferred<RunResult>()
    const holdB = deferred<RunResult>()
    const p = fakePipeline({ A: holdA, B: holdB })
    const send = (content: string) =>
      withContactLock({
        sessionId: SESSION,
        waId,
        now: clock.now,
        content,
        externalId: `wamid-${content}`,
        run: p.run,
        savePending: p.savePending,
      })

    const runA = send('A')
    clock.advance(1_000)
    await send('P1') // antre di run A
    clock.advance(TIMEOUT_MS)
    const runB = send('B') // watchdog rebut lock
    clock.advance(1_000)
    await send('P2') // antre di run B

    holdA.resolve(CONTINUE)
    await runA
    assert.deepEqual(
      p.calls.map((c) => c.content),
      ['A', 'B'],
      'run basi tidak boleh menjalankan putaran drain',
    )

    holdB.resolve(CONTINUE)
    await runB
    // P1 sudah tersimpan sebelum B mulai → ikut terbaca di history B,
    // tidak di-drain ulang. Drain B hanya pesan yang masuk selama B jalan.
    assert.deepEqual(p.calls.slice(2), [{ content: 'P2', skipSave: true }])
  })

  await check(
    'savePending lambat melewati watchdog → pesan masuk antrian pemilik baru',
    async () => {
      const waId = 'wa-late-push-takeover'
      const clock = fakeClock()
      const holdA = deferred<RunResult>()
      const holdB = deferred<RunResult>()
      const p = fakePipeline({ A: holdA, B: holdB })
      const slowSave = deferred<void>()
      const base = {
        sessionId: SESSION,
        waId,
        now: clock.now,
        run: p.run,
      }

      const runA = withContactLock({
        ...base,
        content: 'A',
        externalId: 'wamid-A',
        savePending: p.savePending,
      })
      clock.advance(1_000)
      const queueP = withContactLock({
        ...base,
        content: 'P',
        externalId: 'wamid-P',
        savePending: () => slowSave.promise,
      })
      clock.advance(TIMEOUT_MS)
      const runB = withContactLock({
        ...base,
        content: 'B',
        externalId: 'wamid-B',
        savePending: p.savePending,
      })

      slowSave.resolve()
      await queueP
      holdA.resolve(CONTINUE)
      await runA
      assert.deepEqual(
        p.calls.map((c) => c.content),
        ['A', 'B'],
        'P milik B — run basi tidak boleh men-drain-nya',
      )
      holdB.resolve(CONTINUE)
      await runB
      assert.deepEqual(p.calls.slice(2), [{ content: 'P', skipSave: true }])
    },
  )

  await check(
    'savePending gagal lalu watchdog → pesan tetap di-drain pemilik baru',
    async () => {
      const waId = 'wa-unsaved-takeover'
      const clock = fakeClock()
      const holdA = deferred<RunResult>()
      const holdB = deferred<RunResult>()
      const p = fakePipeline({ A: holdA, B: holdB })
      const base = {
        sessionId: SESSION,
        waId,
        now: clock.now,
        run: p.run,
        savePending: p.savePending,
      }

      const runA = withContactLock({ ...base, content: 'A', externalId: 'a' })
      clock.advance(1_000)
      await withContactLock({
        ...base,
        content: 'M',
        externalId: 'wamid-M',
        savePending: async () => {
          throw new Error('DB blip')
        },
      })
      clock.advance(TIMEOUT_MS)
      const runB = withContactLock({ ...base, content: 'B', externalId: 'b' })

      holdA.resolve(CONTINUE)
      await runA
      holdB.resolve(CONTINUE)
      await runB
      // M tidak ada di CRM → tidak terbaca di history B; wajib di-drain.
      assert.deepEqual(p.calls, [
        { content: 'A', skipSave: false },
        { content: 'B', skipSave: false },
        { content: 'M', skipSave: true },
      ])
    },
  )

  await check(
    'pemilik selesai saat savePending berjalan → pesan tetap dibalas (tanpa simpan ulang)',
    async () => {
      const waId = 'wa-late-push-done'
      const clock = fakeClock()
      const holdA = deferred<RunResult>()
      const p = fakePipeline({ A: holdA })
      const slowSave = deferred<void>()
      const base = {
        sessionId: SESSION,
        waId,
        now: clock.now,
        run: p.run,
      }

      const runA = withContactLock({
        ...base,
        content: 'A',
        externalId: 'wamid-A',
        savePending: p.savePending,
      })
      const queueP = withContactLock({
        ...base,
        content: 'P',
        externalId: 'wamid-P',
        savePending: () => slowSave.promise,
      })

      holdA.resolve(CONTINUE)
      await runA // A selesai, antrian kosong → lock dilepas
      slowSave.resolve()
      await queueP
      assert.deepEqual(p.calls, [
        { content: 'A', skipSave: false },
        { content: 'P', skipSave: true },
      ])
    },
  )

  await check('pipeline melempar error → lock tetap dilepas', async () => {
    const waId = 'wa-throw'
    const clock = fakeClock()
    const p = fakePipeline()
    const base = {
      sessionId: SESSION,
      waId,
      now: clock.now,
      savePending: p.savePending,
    }

    await assert.rejects(
      withContactLock({
        ...base,
        content: 'A',
        externalId: 'wamid-A',
        run: async () => {
          throw new Error('LLM down')
        },
      }),
      /LLM down/,
    )
    await withContactLock({
      ...base,
      content: 'B',
      externalId: 'wamid-B',
      run: p.run,
    })
    assert.deepEqual(p.calls, [{ content: 'B', skipSave: false }])
  })

  console.log(`\nwaba/pipeline-lock: ${passed} pemeriksaan lolos`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
