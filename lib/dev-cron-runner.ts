// Dev-only background runner — di production cron-job.org hit URL.
// Di dev kita perlu beberapa task otomatis supaya owner gak perlu reload
// manual: (1) Kling video polling, (2) objection analyzer batch.
//
// Strategi: singleton interval yang dipanggil sekali di Next.js boot (lewat
// instrumentation.ts). Idempotent: kalau sudah jalan, skip.
import { pollAndFinalizePendingVideos } from '@/lib/services/host-gen/queue'
import { runLiveBotTick } from '@/lib/services/live/bot-runner'
import { batchAnalyzePendingSessions } from '@/lib/services/live/objection-analyzer'

let timer: ReturnType<typeof setInterval> | null = null
let objTimer: ReturnType<typeof setInterval> | null = null
let botTimer: ReturnType<typeof setInterval> | null = null

// Bungkus tick dengan in-flight guard: kalau run sebelumnya belum selesai,
// skip tick ini supaya task tidak overlap dengan dirinya sendiri (run yang
// lebih lama dari interval). Log skip hanya sekali-sekali, jangan spam.
function makeGuardedTick(name: string, run: () => Promise<void>): () => void {
  let inFlight = false
  let skippedStreak = 0
  return () => {
    if (inFlight) {
      skippedStreak++
      // Log skip pertama + tiap kelipatan 10 saja.
      if (skippedStreak === 1 || skippedStreak % 10 === 0) {
        console.log(
          `[dev-cron] ${name}: run sebelumnya masih jalan — skip tick (${skippedStreak}x berturut-turut)`,
        )
      }
      return
    }
    inFlight = true
    run()
      .catch((err) => {
        // run() sudah handle error masing-masing; ini safety net terakhir.
        console.warn(`[dev-cron] ${name} unhandled error:`, (err as Error).message)
      })
      .finally(() => {
        inFlight = false
        skippedStreak = 0
      })
  }
}

export function startDevCronRunner(): void {
  if (timer) return
  // Catatan: dulu di-skip saat production (pakai cron eksternal). Sekarang VPS
  // single-instance jalankan in-process di prod juga supaya Kling poll/baseline
  // finalize otomatis tanpa cron-job.org.

  const intervalMs = 60_000
  const objIntervalMs = 5 * 60_000 // objection analyzer lebih jarang (mahal)
  const botIntervalMs = 8_000 // bot live runner tiap 8 detik — per-room min interval (botIntervalMinSec) tetap dihormati di bot-runner.ts
  console.log(
    `[dev-cron] starting kling-poll (${intervalMs / 1000}s) + objection-analyze (${objIntervalMs / 1000}s) + live-bot (${botIntervalMs / 1000}s) intervals.`,
  )
  timer = setInterval(
    makeGuardedTick('kling-poll', () =>
      pollAndFinalizePendingVideos()
        .then((r) => {
          if (r.checked > 0) {
            console.log(
              `[dev-cron] kling-poll: checked=${r.checked} done=${r.completed} fail=${r.failed} running=${r.stillRunning}`,
            )
          }
        })
        .catch((err) => {
          console.warn('[dev-cron] kling-poll error:', (err as Error).message)
        }),
    ),
    intervalMs,
  )

  objTimer = setInterval(
    makeGuardedTick('objection-analyze', () =>
      batchAnalyzePendingSessions({ limit: 5 })
        .then((r) => {
          if (r.checked > 0) {
            console.log(
              `[dev-cron] objection-analyze: checked=${r.checked} analyzed=${r.analyzed} fail=${r.failed}`,
            )
          }
        })
        .catch((err) => {
          // Anthropic key kosong = expected di dev awal; jangan terus spam log.
          if (!String((err as Error).message).includes('belum di-set')) {
            console.warn('[dev-cron] objection-analyze error:', (err as Error).message)
          }
        }),
    ),
    objIntervalMs,
  )

  botTimer = setInterval(
    makeGuardedTick('live-bot', () =>
      runLiveBotTick()
        .then((r) => {
          if (r.triggered > 0) {
            console.log(
              `[dev-cron] live-bot: checked=${r.checked} triggered=${r.triggered} skipped=${r.skipped} failed=${r.failed}`,
            )
          }
        })
        .catch((err) => {
          console.warn('[dev-cron] live-bot error:', (err as Error).message)
        }),
    ),
    botIntervalMs,
  )

  // unref supaya tidak block proses exit di test/dev.
  ;[timer, objTimer, botTimer].forEach((t) => {
    if (t && typeof (t as unknown as { unref?: () => void }).unref === 'function') {
      ;(t as unknown as { unref: () => void }).unref()
    }
  })
}

export function stopDevCronRunner(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (objTimer) {
    clearInterval(objTimer)
    objTimer = null
  }
  if (botTimer) {
    clearInterval(botTimer)
    botTimer = null
  }
}
