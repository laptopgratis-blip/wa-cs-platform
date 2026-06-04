// Next.js Instrumentation hook — dipanggil sekali saat server boot.
// Pakai untuk start background runner yang bukan request-bound (mis.
// dev-cron untuk Kling polling).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // Hanya start di proses utama Node.js (skip edge runtime).
  if (process.env.NODE_ENV !== 'production') {
    const mod = await import('@/lib/dev-cron-runner')
    mod.startDevCronRunner()
  }
}
