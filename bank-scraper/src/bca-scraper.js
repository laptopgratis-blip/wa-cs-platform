// Scraper KlikBCA Individual via Puppeteer.
//
// Flow:
//   1. Decrypt User ID + PIN dari DB
//   2. Restore cookie session kalau ada → coba akses langsung halaman mutasi
//   3. Kalau session expired → login ulang via authentication.do
//   4. Detect login result: success | OTP_REQUIRED | BLOCKED | AUTH_FAILED
//   5. Submit form mutasi (range 7 hari terakhir)
//   6. Parse hasil → save BankMutation (dedup by hash)
//   7. Auto-match CR mutations ke UserOrder PENDING dengan totalRp == amount
//   8. Logout proper supaya session bersih
//
// Kalau gagal login dengan OTP_REQUIRED → fitur tidak feasible dari IP server,
// integration di-mark gagal, user dapat status di UI.
//
// Anti-detection (best-effort, bukan jaminan):
//   - Stealth plugin (override navigator.webdriver, dll)
//   - User-Agent stabil (Windows Chrome current)
//   - Type dengan delay manusiawi
//   - Reuse session cookies supaya tidak login terlalu sering
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const { prisma } = require('./prisma-client')
const { decrypt, encrypt } = require('./crypto')
const {
  parseMutations,
  extractAccountInfo,
  isEmptyMutationPage,
} = require('./parser')

puppeteer.use(StealthPlugin())

const BCA_BASE = 'https://ibank.klikbca.com'
const SCREENSHOT_DIR = '/app/screenshots'
const SESSION_TTL_MS = 30 * 60 * 1000 // 30 menit, sama dengan timeout BCA

// Re-entry guard: kalau scrape untuk integrationId yang sama sedang jalan,
// skip. Mencegah race antara cron + manual trigger.
const inFlight = new Set()

async function runScrape(integrationId, triggeredBy = 'MANUAL') {
  if (inFlight.has(integrationId)) {
    console.log(`[${integrationId}] Skipped: scrape already in progress`)
    return
  }
  inFlight.add(integrationId)

  const integration = await prisma.bankMutationIntegration.findUnique({
    where: { id: integrationId },
  })

  if (!integration) {
    console.log(`[${integrationId}] Not found`)
    inFlight.delete(integrationId)
    return
  }
  if (
    !integration.isActive ||
    integration.isAdminBlocked ||
    !integration.isBetaConsented
  ) {
    console.log(
      `[${integrationId}] Skipped: inactive=${!integration.isActive} blocked=${integration.isAdminBlocked} consent=${integration.isBetaConsented}`,
    )
    inFlight.delete(integrationId)
    return
  }

  const job = await prisma.bankScrapeJob.create({
    data: {
      integrationId,
      status: 'RUNNING',
      triggeredBy,
      startedAt: new Date(),
    },
  })

  console.log(`[${integrationId}] Scrape started job=${job.id} (${triggeredBy})`)
  const t0 = Date.now()
  let browser
  try {
    let bcaUserId
    let bcaPin
    try {
      bcaUserId = decrypt(integration.bcaUserId)
      bcaPin = decrypt(integration.bcaPin)
    } catch (e) {
      await markFailed(integration.id, job.id, t0, 'ERROR', `Decrypt gagal: ${e.message}`)
      return
    }

    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-gpu',
        '--lang=id-ID',
      ],
      defaultViewport: { width: 1366, height: 768 },
    })

    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    )
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' })

    // ── 1. Coba reuse session ─────────────────────────────────────────
    let needsLogin = true
    if (
      integration.cookieData &&
      integration.sessionExpiresAt &&
      integration.sessionExpiresAt.getTime() > Date.now()
    ) {
      try {
        const cookies = JSON.parse(decrypt(integration.cookieData))
        await page.setCookie(...cookies)
        await page.goto(`${BCA_BASE}/accountstmt.do?value(actions)=acct_stmt`, {
          waitUntil: 'networkidle2',
          timeout: 20000,
        })
        const html = await page.content()
        if (/LOGOUT|Keluar/i.test(html) && !/txt_user_id|password/i.test(html)) {
          needsLogin = false
          console.log(`[${integrationId}] Session reused`)
        }
      } catch (e) {
        console.log(`[${integrationId}] Session reuse failed: ${e.message}`)
      }
    }

    // ── 2. Login kalau perlu ──────────────────────────────────────────
    if (needsLogin) {
      console.log(`[${integrationId}] Logging in...`)
      try {
        await page.goto(`${BCA_BASE}/authentication.do`, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        })
      } catch (e) {
        await screenshotDebug(page, integrationId, 'goto-failed')
        await markFailed(
          integration.id,
          job.id,
          t0,
          'ERROR',
          `Tidak bisa akses halaman login BCA: ${e.message}`,
        )
        return
      }

      // Frameset detect — BCA pakai frameset di halaman utama login.
      const frames = page.frames()
      let loginFrame = page
      for (const f of frames) {
        const url = f.url()
        if (url.includes('login.jsp') || url.includes('authentication')) {
          loginFrame = f
          break
        }
      }

      try {
        await loginFrame.waitForSelector('input[name="value(user_id)"], #txt_user_id', {
          timeout: 15000,
        })
      } catch (e) {
        await screenshotDebug(page, integrationId, 'no-login-form')
        await markFailed(
          integration.id,
          job.id,
          t0,
          'ERROR',
          'Form login tidak muncul (mungkin BCA sedang maintenance).',
        )
        return
      }

      // Cari selector PIN dinamis — BCA kadang ubah ID field.
      const pinSelector = await loginFrame.evaluate(() => {
        // Cari input password atau input bertipe text yang BUKAN user_id.
        const all = Array.from(document.querySelectorAll('input'))
        for (const inp of all) {
          if (inp.type === 'password') {
            return inp.id ? `#${inp.id}` : `input[name="${inp.name}"]`
          }
        }
        // Fallback: input text kedua (user_id biasanya pertama).
        const texts = all.filter(
          (i) => i.type === 'text' && !/user/i.test(i.id || i.name || ''),
        )
        if (texts.length >= 1) {
          const t = texts[0]
          return t.id ? `#${t.id}` : `input[name="${t.name}"]`
        }
        return null
      })
      if (!pinSelector) {
        await screenshotDebug(page, integrationId, 'no-pin-field')
        await markFailed(integration.id, job.id, t0, 'ERROR', 'PIN field tidak ditemukan')
        return
      }

      const userSelector =
        (await loginFrame.$('#txt_user_id'))
          ? '#txt_user_id'
          : 'input[name="value(user_id)"]'

      // Type credentials dengan delay manusiawi.
      await loginFrame.click(userSelector, { clickCount: 3 })
      await loginFrame.type(userSelector, bcaUserId, { delay: 80 })
      await loginFrame.type(pinSelector, bcaPin, { delay: 80 })

      // Submit form.
      try {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
          loginFrame.evaluate(() => {
            const f = document.forms[0] || document.querySelector('form')
            if (f) f.submit()
          }),
        ])
      } catch (e) {
        // Navigation timeout sering kalau halaman pakai frameset & redirect cepat.
        // Lanjut cek konten halaman.
        console.log(`[${integrationId}] Navigation timeout (mungkin OK): ${e.message}`)
      }

      // Detect login result dari semua frame.
      const fullText = await getAllFrameText(page)
      const lower = fullText.toLowerCase()

      if (lower.includes('keybca') || /\botp\b/.test(lower) || lower.includes('respon kode')) {
        await screenshotDebug(page, integrationId, 'otp-required')
        await markFailed(
          integration.id,
          job.id,
          t0,
          'OTP_REQUIRED',
          'BCA meminta OTP/KeyBCA. Login dari IP server tidak dikenal — fitur tidak feasible dari sini.',
        )
        return
      }
      if (lower.includes('terkunci') || lower.includes('blocked') || lower.includes('locked')) {
        await markFailed(
          integration.id,
          job.id,
          t0,
          'BLOCKED',
          'Akun BCA terkunci. Silakan unblock via cabang atau Halo BCA.',
        )
        return
      }
      if (
        lower.includes('user id atau pin salah') ||
        lower.includes('id atau pin yang anda masukkan salah') ||
        lower.includes('not registered') ||
        (lower.includes('pin') && lower.includes('salah'))
      ) {
        await markFailed(
          integration.id,
          job.id,
          t0,
          'AUTH_FAILED',
          'User ID atau PIN BCA salah. Update kredensial di pengaturan.',
        )
        return
      }
      if (!lower.includes('logout') && !lower.includes('keluar') && !lower.includes('selamat datang')) {
        await screenshotDebug(page, integrationId, 'unknown-login-state')
        await markFailed(
          integration.id,
          job.id,
          t0,
          'ERROR',
          'Login state tidak dikenali. Cek screenshot debug.',
        )
        return
      }

      console.log(`[${integrationId}] Login success`)

      // Save fresh cookies ter-encrypt.
      const cookies = await page.cookies()
      await prisma.bankMutationIntegration.update({
        where: { id: integration.id },
        data: {
          cookieData: encrypt(JSON.stringify(cookies)),
          sessionExpiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      })
    }

    // ── 3. Navigate ke halaman mutasi ─────────────────────────────────
    try {
      await page.goto(`${BCA_BASE}/accountstmt.do?value(actions)=acct_stmt`, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      })
    } catch (e) {
      await markFailed(
        integration.id,
        job.id,
        t0,
        'ERROR',
        `Tidak bisa akses halaman mutasi: ${e.message}`,
      )
      return
    }

    // ── 4. Set range 7 hari & submit ──────────────────────────────────
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - 7)

    const fmt = (d) => ({
      dt: String(d.getDate()).padStart(2, '0'),
      mt: String(d.getMonth() + 1).padStart(2, '0'),
      yr: String(d.getFullYear()),
    })
    const start = fmt(startDate)
    const end = fmt(today)

    // Select frame yang punya form mutasi (BCA pakai frameset).
    let formFrame = page.mainFrame()
    for (const f of page.frames()) {
      const url = f.url()
      if (url.includes('accountstmt.do')) {
        formFrame = f
        break
      }
    }

    await formFrame
      .evaluate(
        (start, end) => {
          const setVal = (name, val) => {
            const el = document.querySelector(
              `select[name="${name}"], input[name="${name}"]`,
            )
            if (el) el.value = val
          }
          setVal('value(startDt)', start.dt)
          setVal('value(startMt)', start.mt)
          setVal('value(startYr)', start.yr)
          setVal('value(endDt)', end.dt)
          setVal('value(endMt)', end.mt)
          setVal('value(endYr)', end.yr)
          // Pilih radio "Tanggal" (option 1) kalau ada.
          const r = document.querySelector('input[type="radio"][value="1"]')
          if (r) r.checked = true
        },
        start,
        end,
      )
      .catch(() => {})

    try {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        formFrame.evaluate(() => {
          const f = document.forms[0] || document.querySelector('form')
          if (f) f.submit()
        }),
      ])
    } catch (e) {
      console.log(`[${integrationId}] Mutation submit timeout: ${e.message}`)
    }

    // ── 5. Parse hasil ────────────────────────────────────────────────
    // Ambil HTML dari semua frame & gabung — frame mutasi seringkali frame ke-2.
    let resultHtml = ''
    for (const f of page.frames()) {
      try {
        resultHtml += '\n' + (await f.content())
      } catch (e) {
        // skip
      }
    }
    if (!resultHtml) resultHtml = await page.content()

    if (isEmptyMutationPage(resultHtml)) {
      console.log(`[${integrationId}] No mutations in 7-day window`)
      await markSuccess(integration.id, job.id, t0, 0, 0, 0)
      return
    }

    // Update account info kalau belum ada.
    if (!integration.accountNumber) {
      const acc = extractAccountInfo(resultHtml)
      if (acc) {
        await prisma.bankMutationIntegration.update({
          where: { id: integration.id },
          data: { accountNumber: acc.number, accountName: acc.name },
        })
      }
    }

    const mutations = parseMutations(resultHtml)
    console.log(`[${integrationId}] Parsed ${mutations.length} mutations`)

    let newCount = 0
    let autoConfirmed = 0

    for (const m of mutations) {
      const hash = crypto
        .createHash('sha256')
        .update(`${m.date}|${m.amount}|${m.description}|${m.type}`)
        .digest('hex')

      const existing = await prisma.bankMutation.findUnique({
        where: {
          integrationId_mutationHash: {
            integrationId: integration.id,
            mutationHash: hash,
          },
        },
      })
      if (existing) continue

      newCount++

      const saved = await prisma.bankMutation.create({
        data: {
          userId: integration.userId,
          integrationId: integration.id,
          bankCode: 'BCA',
          accountNumber: integration.accountNumber || '',
          mutationDate: parseDate(m.date),
          mutationType: m.type,
          amount: m.amount,
          description: m.description,
          branch: m.branch,
          balance: m.balance,
          mutationHash: hash,
          rawHtml: m.rawHtml ? m.rawHtml.slice(0, 5000) : null,
        },
      })

      // Auto-match HANYA untuk CR (uang masuk) & integrasi punya
      // autoConfirmEnabled.
      if (m.type === 'CR' && integration.autoConfirmEnabled) {
        const result = await matchAndConfirmOrder(integration, saved)
        if (result.action === 'AUTO_CONFIRMED') autoConfirmed++
      } else {
        // Tetap update matchAction supaya UI bisa filter.
        await prisma.bankMutation.update({
          where: { id: saved.id },
          data: { matchAction: m.type === 'DB' ? 'IGNORED' : 'NO_MATCH' },
        })
      }
    }

    await markSuccess(integration.id, job.id, t0, mutations.length, newCount, autoConfirmed)
    console.log(
      `[${integrationId}] Done: ${newCount} new, ${autoConfirmed} auto-confirmed`,
    )

    // ── 6. Logout proper ──────────────────────────────────────────────
    try {
      await page.goto(`${BCA_BASE}/authentication.do?value(actions)=logout`, {
        waitUntil: 'networkidle2',
        timeout: 10000,
      })
    } catch (e) {
      // Ignore — logout best-effort.
    }
  } catch (err) {
    console.error(`[${integrationId}] Error:`, err)
    try {
      await markFailed(integrationId, job.id, t0, 'ERROR', err.message || String(err))
    } catch (e) {
      console.error(`[${integrationId}] markFailed also threw:`, e)
    }
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch (e) {
        // ignore
      }
    }
    inFlight.delete(integrationId)
  }
}

// Match CR mutation ke UserOrder PENDING:
//   - paymentMethod TRANSFER
//   - paymentStatus PENDING
//   - totalRp == amount (exact, sudah include uniqueCode kalau ada)
//   - createdAt dalam 7 hari
//
// Multiple match → fallback ke name match kalau di-enable. Kalau masih
// >1 → MULTIPLE_MATCH (perlu resolve manual).
async function matchAndConfirmOrder(integration, mutation) {
  const candidates = await prisma.userOrder.findMany({
    where: {
      userId: integration.userId,
      paymentMethod: 'TRANSFER',
      paymentStatus: 'PENDING',
      totalRp: mutation.amount,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
  })

  let action = 'NO_MATCH'
  let matched = null
  let score = 0

  if (candidates.length === 0) {
    action = 'NO_MATCH'
  } else if (candidates.length === 1) {
    matched = candidates[0]
    action = 'AUTO_CONFIRMED'
    score = 1.0
  } else if (integration.matchByCustomerName) {
    const named = candidates.filter(
      (c) => similarString(c.customerName, mutation.description) >= 0.6,
    )
    if (named.length === 1) {
      matched = named[0]
      action = 'AUTO_CONFIRMED'
      score = 0.85
    } else {
      action = 'MULTIPLE_MATCH'
    }
  } else {
    action = 'MULTIPLE_MATCH'
  }

  await prisma.bankMutation.update({
    where: { id: mutation.id },
    data: {
      matchedOrderId: matched?.id ?? null,
      matchAction: action,
      matchScore: score,
    },
  })

  if (matched && action === 'AUTO_CONFIRMED') {
    await prisma.userOrder.update({
      where: { id: matched.id },
      data: {
        paymentStatus: 'PAID',
        paidAt: new Date(),
        autoConfirmedAt: new Date(),
        autoConfirmedBy: 'BCA_AUTO',
        matchedMutationId: mutation.id,
      },
    })

    await prisma.bankMutationIntegration.update({
      where: { id: integration.id },
      data: { totalAutoConfirmed: { increment: 1 } },
    })

    notifyOrderPaid(matched.id).catch((e) =>
      console.error(`[notifyOrderPaid ${matched.id}]`, e),
    )
  }

  return { action, order: matched, score }
}

// Notify Hulao backend supaya fire pixel Purchase + WA notification ke
// customer. Best-effort — kalau gagal, mutation tetap ter-record &
// order tetap PAID, hanya notif yang miss.
async function notifyOrderPaid(orderId) {
  const url = (process.env.NEXTJS_URL || 'http://nextjs:3000') +
    '/api/internal/order-auto-paid'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-scraper-secret': process.env.SCRAPER_SECRET || '',
    },
    body: JSON.stringify({ orderId, source: 'BCA_AUTO' }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[notifyOrderPaid] non-OK response ${res.status}: ${text.slice(0, 200)}`)
  }
}

// String similarity sederhana — substring match dengan normalisasi.
// Cukup untuk match nama customer dgn deskripsi BCA seperti
// "TRSF E-BANKING CR ANDI PRATAMA".
function similarString(a, b) {
  if (!a || !b) return 0
  const aN = a.toLowerCase().replace(/[^a-z0-9]/g, '')
  const bN = b.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!aN || !bN) return 0
  if (bN.includes(aN) || aN.includes(bN)) return 0.9
  // Token overlap
  const aTok = new Set(a.toLowerCase().split(/\s+/).filter((t) => t.length >= 3))
  const bTok = new Set(b.toLowerCase().split(/\s+/).filter((t) => t.length >= 3))
  if (aTok.size === 0) return 0
  let hit = 0
  for (const t of aTok) if (bTok.has(t)) hit++
  return hit / aTok.size
}

function parseDate(dateStr) {
  // "DD/MM/YYYY"
  const [d, m, y] = dateStr.split('/')
  return new Date(`${y}-${m}-${d}T00:00:00+07:00`)
}

async function getAllFrameText(page) {
  let text = ''
  for (const f of page.frames()) {
    try {
      const t = await f.evaluate(() => document.body?.innerText || '')
      text += '\n' + t
    } catch (e) {
      // ignore
    }
  }
  return text
}

async function markSuccess(integrationId, jobId, t0, total, newCount, autoConfirmed) {
  const durationMs = Date.now() - t0
  await prisma.bankScrapeJob.update({
    where: { id: jobId },
    data: {
      status: 'SUCCESS',
      completedAt: new Date(),
      durationMs,
      mutationsFound: total,
      newMutations: newCount,
      autoConfirmed,
    },
  })
  await prisma.bankMutationIntegration.update({
    where: { id: integrationId },
    data: {
      lastScrapedAt: new Date(),
      lastScrapeStatus: 'SUCCESS',
      lastScrapeError: null,
      totalMutationsCaptured: { increment: newCount },
      totalScrapes: { increment: 1 },
    },
  })
}

async function markFailed(integrationId, jobId, t0, status, error) {
  const durationMs = Date.now() - t0
  await prisma.bankScrapeJob.update({
    where: { id: jobId },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
      durationMs,
      errorMessage: error,
    },
  })
  await prisma.bankMutationIntegration.update({
    where: { id: integrationId },
    data: {
      lastScrapedAt: new Date(),
      lastScrapeStatus: status,
      lastScrapeError: error,
      totalScrapeFailures: { increment: 1 },
      totalScrapes: { increment: 1 },
    },
  })
}

async function screenshotDebug(page, integrationId, name) {
  try {
    if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
    const filepath = path.join(
      SCREENSHOT_DIR,
      `${integrationId}-${Date.now()}-${name}.png`,
    )
    await page.screenshot({ path: filepath, fullPage: true })
    console.log(`[${integrationId}] Screenshot: ${filepath}`)
    return filepath
  } catch (e) {
    console.error(`[${integrationId}] Screenshot failed:`, e.message)
    return null
  }
}

module.exports = { runScrape }
