// Helper untuk panggil bank-scraper service (Puppeteer container) dari
// Next.js API routes. Service mendengarkan di http://bank-scraper:3002
// di internal docker network. Auth via x-scraper-secret header.
const SCRAPER_URL =
  process.env.BANK_SCRAPER_URL || 'http://bank-scraper:3002'
const SCRAPER_SECRET = process.env.SCRAPER_SECRET || ''

export interface ScraperTriggerResult {
  ok: boolean
  status: number
  data?: unknown
  error?: string
}

async function callScraper(
  path: string,
  body: unknown,
): Promise<ScraperTriggerResult> {
  if (!SCRAPER_SECRET) {
    return { ok: false, status: 500, error: 'SCRAPER_SECRET belum di-set' }
  }
  try {
    const res = await fetch(`${SCRAPER_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-scraper-secret': SCRAPER_SECRET,
      },
      body: JSON.stringify(body ?? {}),
      // Scraper service async — response cepat, kita tidak tunggu scrape selesai.
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data: data ?? undefined }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : 'unknown error',
    }
  }
}

export async function triggerScrape(
  integrationId: string,
  triggeredBy: 'MANUAL' | 'CRON' | 'RETRY' = 'MANUAL',
) {
  return callScraper(`/scrape/${integrationId}`, { triggeredBy })
}

export async function triggerCronRunAll() {
  return callScraper('/cron/run-all', {})
}

export async function pingScraper(): Promise<boolean> {
  try {
    const res = await fetch(`${SCRAPER_URL}/health`, {
      signal: AbortSignal.timeout(3_000),
    })
    return res.ok
  } catch {
    return false
  }
}
