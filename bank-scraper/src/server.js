// HTTP API untuk bank-scraper service. Dipanggil internal oleh Next.js
// (http://bank-scraper:3002) — service ini TIDAK ekspos port public.
//
// Endpoints:
//   POST /scrape/:integrationId — trigger scrape async (non-blocking)
//   POST /cron/run-all          — pilih integration yang due, stagger jobs
//   GET  /health                — liveness probe
//
// Auth: header 'x-scraper-secret' wajib match SCRAPER_SECRET env.
const express = require('express')

const { runScrape } = require('./bca-scraper')
const { prisma } = require('./prisma-client')

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || ''
const PORT = parseInt(process.env.PORT || '3002', 10)
// Batch limit per cron run — jangan burst, BCA punya fraud detection.
const CRON_BATCH_LIMIT = parseInt(process.env.CRON_BATCH_LIMIT || '10', 10)
// Default interval scrape per user (menit) — kalau lebih cepat dari ini,
// cron skip user tersebut.
const DEFAULT_INTERVAL_MIN = parseInt(
  process.env.DEFAULT_INTERVAL_MIN || '15',
  10,
)

if (!SCRAPER_SECRET) {
  console.warn(
    '[bank-scraper] WARNING: SCRAPER_SECRET kosong — endpoint terbuka tanpa auth!',
  )
}

const app = express()
app.use(express.json({ limit: '256kb' }))

function authMiddleware(req, res, next) {
  if (!SCRAPER_SECRET) return next() // dev only
  const got = req.headers['x-scraper-secret']
  if (got !== SCRAPER_SECRET) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.post('/scrape/:integrationId', authMiddleware, async (req, res) => {
  const { integrationId } = req.params
  const triggeredBy = req.body?.triggeredBy || 'MANUAL'

  // Async — return cepat, scrape jalan di background.
  runScrape(integrationId, triggeredBy).catch((err) => {
    console.error(`[scrape ${integrationId}] uncaught:`, err)
  })
  res.json({ success: true, message: 'Scrape started', integrationId })
})

app.post('/cron/run-all', authMiddleware, async (_req, res) => {
  try {
    const cutoff = new Date(Date.now() - DEFAULT_INTERVAL_MIN * 60 * 1000)
    const due = await prisma.bankMutationIntegration.findMany({
      where: {
        isActive: true,
        isAdminBlocked: false,
        isBetaConsented: true,
        OR: [{ lastScrapedAt: null }, { lastScrapedAt: { lt: cutoff } }],
      },
      orderBy: { lastScrapedAt: 'asc' },
      take: CRON_BATCH_LIMIT,
      select: { id: true },
    })

    // Stagger 0–60s — anti pattern detection BCA.
    for (const integration of due) {
      const delay = Math.floor(Math.random() * 60_000)
      setTimeout(() => {
        runScrape(integration.id, 'CRON').catch((err) => {
          console.error(`[cron ${integration.id}]`, err)
        })
      }, delay)
    }

    res.json({ success: true, scheduled: due.length, batchLimit: CRON_BATCH_LIMIT })
  } catch (err) {
    console.error('[cron/run-all]', err)
    res.status(500).json({ success: false, error: 'cron failed' })
  }
})

// 404 fallback.
app.use((_req, res) => res.status(404).json({ error: 'not found' }))

app.listen(PORT, () => {
  console.log(`[bank-scraper] Listening on :${PORT}`)
})

// Graceful shutdown — biar Prisma close clean.
async function shutdown(signal) {
  console.log(`[bank-scraper] ${signal} received, shutting down`)
  await prisma.$disconnect().catch(() => {})
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
