// Uji unduhan image_url API publik (anti SSRF). Jalankan lewat `npm test`.
//
// Dua bagian: (1) orkestrasi fetchImageFromUrl dengan deps palsu — tiap hop
// redirect divalidasi ulang SEBELUM disentuh; (2) httpGetImageOnce sungguhan
// ke server lokal — redirect tidak diikuti diam-diam, cap ukuran, dan guard
// IP saat koneksi (guardedLookup) memblokir localhost.
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import {
  fetchImageFromUrl,
  httpGetImageOnce,
  type HopResult,
  type ImageFetchDeps,
  MAX_IMAGE_REDIRECTS,
} from './image-fetch'
import { MAX_IMAGE_BYTES } from './image-data'

let passed = 0
function check(name: string, fn: () => Promise<void>): Promise<void> {
  return fn().then(() => {
    passed += 1
    console.log(`  ok  ${name}`)
  })
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])

// Guard palsu: tolak host berakhiran ".internal" (mewakili IP privat).
async function fakeAssertUrl(raw: string): Promise<URL> {
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new Error('URL webhook wajib https://.')
  if (url.hostname.endsWith('.internal'))
    throw new Error('Domain menunjuk ke alamat internal/privat — tidak diizinkan.')
  return url
}

function fakeDeps(
  routes: Record<string, HopResult>,
  touched: string[] = [],
): ImageFetchDeps {
  return {
    assertUrl: fakeAssertUrl,
    getOnce: async (url) => {
      touched.push(url.toString())
      return routes[url.toString()] ?? { kind: 'error', error: 'ECONNREFUSED' }
    },
  }
}

async function orchestration(): Promise<void> {
  console.log('image-fetch: fetchImageFromUrl (deps palsu)')

  await check('200 + PNG → ok, mime dari magic bytes', async () => {
    const r = await fetchImageFromUrl(
      'https://cdn.example/a.png',
      fakeDeps({
        'https://cdn.example/a.png': { kind: 'body', status: 200, buffer: PNG },
      }),
    )
    assert.ok(r.ok)
    assert.equal(r.image.mime, 'image/png')
    assert.equal(r.image.buffer.length, PNG.length)
  })

  await check('redirect ke host publik diikuti (Location relatif di-resolve)', async () => {
    const r = await fetchImageFromUrl(
      'https://short.example/x',
      fakeDeps({
        'https://short.example/x': {
          kind: 'redirect',
          status: 302,
          location: 'https://cdn.example/img/1',
        },
        'https://cdn.example/img/1': {
          kind: 'redirect',
          status: 301,
          location: '/img/1.jpg',
        },
        'https://cdn.example/img/1.jpg': { kind: 'body', status: 200, buffer: JPEG },
      }),
    )
    assert.ok(r.ok)
    assert.equal(r.image.mime, 'image/jpeg')
  })

  await check('redirect ke alamat internal → ditolak, alamat internal TIDAK disentuh', async () => {
    const touched: string[] = []
    const r = await fetchImageFromUrl(
      'https://attacker.example/a.jpg',
      fakeDeps(
        {
          'https://attacker.example/a.jpg': {
            kind: 'redirect',
            status: 302,
            location: 'https://db.internal:5432/',
          },
        },
        touched,
      ),
    )
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /internal\/privat/)
    assert.deepEqual(touched, ['https://attacker.example/a.jpg'])
  })

  await check('redirect turun ke http:// → ditolak (wajib https)', async () => {
    const r = await fetchImageFromUrl(
      'https://cdn.example/a',
      fakeDeps({
        'https://cdn.example/a': {
          kind: 'redirect',
          status: 302,
          location: 'http://cdn.example/a.jpg',
        },
      }),
    )
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.match(r.error, /https/)
      assert.doesNotMatch(r.error, /webhook/i)
    }
  })

  await check(`lebih dari ${MAX_IMAGE_REDIRECTS} redirect → ditolak`, async () => {
    const routes: Record<string, HopResult> = {}
    for (let i = 0; i <= MAX_IMAGE_REDIRECTS + 1; i++) {
      routes[`https://loop.example/${i}`] = {
        kind: 'redirect',
        status: 302,
        location: `https://loop.example/${i + 1}`,
      }
    }
    const touched: string[] = []
    const r = await fetchImageFromUrl('https://loop.example/0', fakeDeps(routes, touched))
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /redirect/)
    assert.equal(touched.length, MAX_IMAGE_REDIRECTS + 1)
  })

  await check('redirect tanpa Location → ditolak', async () => {
    const r = await fetchImageFromUrl(
      'https://cdn.example/a',
      fakeDeps({
        'https://cdn.example/a': { kind: 'redirect', status: 302, location: null },
      }),
    )
    assert.equal(r.ok, false)
  })

  await check('HTTP 404 → pesan menyebut status', async () => {
    const r = await fetchImageFromUrl(
      'https://cdn.example/a.jpg',
      fakeDeps({
        'https://cdn.example/a.jpg': {
          kind: 'body',
          status: 404,
          buffer: Buffer.alloc(0),
        },
      }),
    )
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /404/)
  })

  await check('bukan gambar (HTML) / kosong / terlalu besar → ditolak', async () => {
    const html = await fetchImageFromUrl(
      'https://cdn.example/a',
      fakeDeps({
        'https://cdn.example/a': {
          kind: 'body',
          status: 200,
          buffer: Buffer.from('<html>login</html>'),
        },
      }),
    )
    assert.equal(html.ok, false)
    if (!html.ok) assert.match(html.error, /JPEG, PNG, WebP/)

    const empty = await fetchImageFromUrl(
      'https://cdn.example/b',
      fakeDeps({
        'https://cdn.example/b': { kind: 'body', status: 200, buffer: Buffer.alloc(0) },
      }),
    )
    assert.equal(empty.ok, false)

    const big = await fetchImageFromUrl(
      'https://cdn.example/c',
      fakeDeps({ 'https://cdn.example/c': { kind: 'too_large' } }),
    )
    assert.equal(big.ok, false)
    if (!big.ok) assert.match(big.error, /5 MB/)
  })

  await check('error jaringan → pesan umum, detail teknis tidak bocor', async () => {
    const r = await fetchImageFromUrl(
      'https://cdn.example/a.jpg',
      fakeDeps({
        'https://cdn.example/a.jpg': {
          kind: 'error',
          error: 'connect ECONNREFUSED 10.0.0.7:443 (EBLOCKED)',
        },
      }),
    )
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.doesNotMatch(r.error, /ECONNREFUSED|10\.0\.0\.7|EBLOCKED/)
      assert.match(r.error, /tidak bisa diunduh/)
    }
  })

  await check('melewati batas waktu total → ditolak dengan pesan timeout', async () => {
    const deps: ImageFetchDeps = {
      assertUrl: fakeAssertUrl,
      getOnce: (_url, opts) =>
        new Promise<HopResult>((resolve) => {
          opts.signal.addEventListener('abort', () =>
            resolve({ kind: 'error', error: 'AbortError' }),
          )
        }),
    }
    const r = await fetchImageFromUrl('https://slow.example/a.jpg', deps, {
      timeoutMs: 50,
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /detik/)
  })

  await check('DNS guard lambat (tak bisa dibatalkan) tetap kena batas waktu total', async () => {
    let getOnceCalled = false
    const deps: ImageFetchDeps = {
      // Mewakili dns.lookup ke resolver penyerang yang sengaja lambat.
      assertUrl: () => new Promise<URL>(() => {}),
      getOnce: async () => {
        getOnceCalled = true
        return { kind: 'error', error: 'tidak boleh dipanggil' }
      },
    }
    const started = Date.now()
    const r = await fetchImageFromUrl('https://slow-dns.example/a.jpg', deps, {
      timeoutMs: 50,
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /detik/)
    assert.ok(Date.now() - started < 1000, 'harus selesai mendekati timeoutMs')
    assert.equal(getOnceCalled, false)
  })
}

// ── Server lokal untuk httpGetImageOnce sungguhan ──
interface LocalServer {
  base: string
  hits: string[]
  close: () => Promise<void>
}

function startServer(): Promise<LocalServer> {
  const hits: string[] = []
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? '')
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/img.png' })
      res.end()
    } else if (req.url === '/img.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(PNG)
    } else if (req.url === '/big-declared') {
      res.writeHead(200, { 'Content-Length': String(MAX_IMAGE_BYTES + 1) })
      res.end(PNG)
    } else if (req.url === '/big-chunked') {
      // Tanpa Content-Length → harus dihentikan saat hitungan lewat cap.
      res.writeHead(200, { 'Content-Type': 'image/png' })
      const chunk = Buffer.alloc(512 * 1024, 0x41)
      let sent = 0
      const pump = () => {
        while (sent <= MAX_IMAGE_BYTES + chunk.length) {
          sent += chunk.length
          if (!res.write(chunk)) {
            res.once('drain', pump)
            return
          }
        }
        res.end()
      }
      res.on('error', () => {})
      pump()
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        base: `http://localhost:${port}`,
        hits,
        close: () =>
          new Promise<void>((r) => {
            server.closeAllConnections()
            server.close(() => r())
          }),
      })
    })
  })
}

function signal(): AbortSignal {
  return new AbortController().signal
}

async function realHttp(): Promise<void> {
  console.log('image-fetch: httpGetImageOnce (server lokal)')
  const srv = await startServer()
  const prevEnv = process.env.WEBHOOK_ALLOW_PRIVATE_URL
  try {
    process.env.WEBHOOK_ALLOW_PRIVATE_URL = '1' // izinkan 127.0.0.1 khusus uji

    await check('302 TIDAK diikuti diam-diam → dikembalikan sebagai redirect', async () => {
      srv.hits.length = 0
      const r = await httpGetImageOnce(new URL(`${srv.base}/redirect`), {
        maxBytes: MAX_IMAGE_BYTES,
        signal: signal(),
      })
      assert.equal(r.kind, 'redirect')
      if (r.kind === 'redirect') assert.equal(r.location, '/img.png')
      assert.deepEqual(srv.hits, ['/redirect'])
    })

    await check('200 → body utuh', async () => {
      const r = await httpGetImageOnce(new URL(`${srv.base}/img.png`), {
        maxBytes: MAX_IMAGE_BYTES,
        signal: signal(),
      })
      assert.equal(r.kind, 'body')
      if (r.kind === 'body') {
        assert.equal(r.status, 200)
        assert.ok(r.buffer.equals(PNG))
      }
    })

    await check('Content-Length > cap → too_large tanpa membaca body', async () => {
      const r = await httpGetImageOnce(new URL(`${srv.base}/big-declared`), {
        maxBytes: MAX_IMAGE_BYTES,
        signal: signal(),
      })
      assert.equal(r.kind, 'too_large')
    })

    await check('stream tanpa Content-Length lewat cap → too_large', async () => {
      const r = await httpGetImageOnce(new URL(`${srv.base}/big-chunked`), {
        maxBytes: MAX_IMAGE_BYTES,
        signal: signal(),
      })
      assert.equal(r.kind, 'too_large')
    })

    await check('fetchImageFromUrl utuh: redirect lokal diikuti lalu gambar diterima', async () => {
      const r = await fetchImageFromUrl(`${srv.base}/redirect`)
      assert.ok(r.ok)
      if (r.ok) assert.equal(r.image.mime, 'image/png')
    })

    // Tanpa izin env: guardedLookup menolak localhost SAAT koneksi dibuat.
    delete process.env.WEBHOOK_ALLOW_PRIVATE_URL
    await check('IP literal privat diblokir walau dipanggil langsung (lookup dilewati Node)', async () => {
      srv.hits.length = 0
      const port = new URL(srv.base).port
      const r = await httpGetImageOnce(new URL(`http://127.0.0.1:${port}/img.png`), {
        maxBytes: MAX_IMAGE_BYTES,
        signal: signal(),
      })
      assert.equal(r.kind, 'error')
      assert.deepEqual(srv.hits, [])
    })

    await check('guard koneksi: localhost diblokir, server tidak menerima request', async () => {
      srv.hits.length = 0
      const r = await httpGetImageOnce(new URL(`${srv.base}/img.png`), {
        maxBytes: MAX_IMAGE_BYTES,
        signal: signal(),
      })
      assert.equal(r.kind, 'error')
      assert.deepEqual(srv.hits, [])
    })
  } finally {
    if (prevEnv === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE_URL
    else process.env.WEBHOOK_ALLOW_PRIVATE_URL = prevEnv
    await srv.close()
  }
}

async function main(): Promise<void> {
  await orchestration()
  await realHttp()
  console.log(`\nimage-fetch: ${passed} pemeriksaan lolos`)
}

void main()
