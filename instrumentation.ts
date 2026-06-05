// Next.js Instrumentation hook — dipanggil sekali saat server boot.
// Pakai untuk start background runner yang bukan request-bound (mis.
// dev-cron untuk Kling polling).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // Single-instance VPS: jalankan cron in-process di PROD juga (Kling poll,
  // objection-analyze, live-bot). Tanpa ini, video Kling/baseline yang
  // ke-submit tak pernah finalize di prod → spinner abadi. Cron eksternal
  // (cron-job.org) jadi tidak wajib.
  const mod = await import('@/lib/dev-cron-runner')
  mod.startDevCronRunner()
}
