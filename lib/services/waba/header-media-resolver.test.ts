// Uji resolver header media template (CDN Meta → unduh → upload → media id)
// dengan deps palsu — tanpa jaringan/DB. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import {
  clearHeaderMediaCache,
  resolveTemplateHeaderMedia,
  type HeaderMediaResolverDeps,
  type HeaderMediaTemplateRef,
} from './header-media-resolver'

let passed = 0
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  clearHeaderMediaCache()
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const CDN_URL = 'https://scontent.whatsapp.net/v/t61.29466-34/123_n.jpg?ccb=1-7&oe=6712ABCD'
const CDN_URL_FRESH = 'https://scontent.whatsapp.net/v/t61.29466-34/123_n.jpg?ccb=1-7&oe=7799FFFF'
const HULAO_URL = 'https://hulao.id/uploads/waba-templates/user1/abc123.jpg'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 1, 2, 3])

function tpl(over: Partial<HeaderMediaTemplateRef> = {}): HeaderMediaTemplateRef {
  return {
    id: 'tpl_1',
    name: 'broadcastantimarketplace1',
    metaTemplateId: 'meta_123',
    headerType: 'IMAGE',
    headerMediaUrl: CDN_URL,
    ...over,
  }
}

interface FakeLog {
  downloads: string[]
  uploads: { mime: string; size: number; filename?: string }[]
  refreshes: string[]
  saves: { templateId: string; oldUrl: string; newUrl: string }[]
}

function fakeDeps(over: Partial<HeaderMediaResolverDeps> = {}): { deps: HeaderMediaResolverDeps; log: FakeLog } {
  const log: FakeLog = { downloads: [], uploads: [], refreshes: [], saves: [] }
  let uploadSeq = 0
  const deps: HeaderMediaResolverDeps = {
    download: async (url) => {
      log.downloads.push(url)
      return { ok: true, bytes: JPEG, contentType: 'image/jpeg' }
    },
    fetchTemplateHeaderUrl: async (metaTemplateId) => {
      log.refreshes.push(metaTemplateId)
      return CDN_URL_FRESH
    },
    saveTemplateHeaderUrl: async (templateId, oldUrl, newUrl) => {
      log.saves.push({ templateId, oldUrl, newUrl })
    },
    upload: async (input) => {
      // Tunda sedikit supaya pemanggil paralel benar-benar tumpang tindih.
      await new Promise((r) => setTimeout(r, 10))
      log.uploads.push({ mime: input.mime, size: input.buffer.length, filename: input.filename })
      uploadSeq += 1
      return { ok: true, data: { id: `media_${uploadSeq}` } }
    },
    now: () => Date.now(),
    ...over,
  }
  return { deps, log }
}

const BASE = { phoneNumberId: 'pn_1', token: 'tok' }

async function main(): Promise<void> {
  console.log('waba/header-media-resolver')

  await check('header bukan media → ok tanpa header, tanpa unduh', async () => {
    const { deps, log } = fakeDeps()
    const r = await resolveTemplateHeaderMedia({ ...BASE, template: tpl({ headerType: 'TEXT' }), deps })
    assert.deepEqual(r, { ok: true })
    assert.equal(log.downloads.length, 0)
  })

  await check('URL publik hulao (non-CDN) → ok tanpa header, host tidak pernah diunduh', async () => {
    const { deps, log } = fakeDeps()
    const r = await resolveTemplateHeaderMedia({ ...BASE, template: tpl({ headerMediaUrl: HULAO_URL }), deps })
    assert.deepEqual(r, { ok: true })
    assert.equal(log.downloads.length, 0)
    assert.equal(log.uploads.length, 0)
  })

  await check('host palsu mirip CDN tidak pernah diunduh', async () => {
    const { deps, log } = fakeDeps()
    const r = await resolveTemplateHeaderMedia({
      ...BASE,
      template: tpl({ headerMediaUrl: 'https://whatsapp.net.evil.com/x.jpg' }),
      deps,
    })
    assert.deepEqual(r, { ok: true })
    assert.equal(log.downloads.length, 0)
  })

  await check('URL CDN Meta → unduh → upload → header { type:image, mediaId }', async () => {
    const { deps, log } = fakeDeps()
    const r = await resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps })
    assert.deepEqual(r, { ok: true, header: { type: 'image', mediaId: 'media_1' } })
    assert.deepEqual(log.downloads, [CDN_URL])
    assert.equal(log.uploads.length, 1)
    assert.equal(log.uploads[0]?.mime, 'image/jpeg')
    assert.equal(log.uploads[0]?.size, JPEG.length)
    assert.equal(log.refreshes.length, 0)
  })

  await check('cache hit → tidak unduh/upload ulang', async () => {
    const { deps, log } = fakeDeps()
    const a = await resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps })
    const b = await resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps })
    assert.deepEqual(a, b)
    assert.equal(log.downloads.length, 1)
    assert.equal(log.uploads.length, 1)
  })

  await check('cache per nomor pengirim (media id terikat phoneNumberId)', async () => {
    const { deps, log } = fakeDeps()
    await resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps })
    const other = await resolveTemplateHeaderMedia({ ...BASE, phoneNumberId: 'pn_2', template: tpl(), deps })
    assert.equal(log.uploads.length, 2)
    assert.deepEqual(other, { ok: true, header: { type: 'image', mediaId: 'media_2' } })
  })

  await check('cache kedaluwarsa setelah TTL → upload ulang', async () => {
    let clock = 1_000_000
    const { deps, log } = fakeDeps({ now: () => clock })
    await resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps })
    clock += 6 * 60 * 60 * 1000 + 1
    const r = await resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps })
    assert.equal(log.uploads.length, 2)
    assert.deepEqual(r, { ok: true, header: { type: 'image', mediaId: 'media_2' } })
  })

  await check('dua panggilan paralel (penerima broadcast) → satu unduh & satu upload', async () => {
    const { deps, log } = fakeDeps()
    const [a, b, c] = await Promise.all([
      resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps }),
      resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps }),
      resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps }),
    ])
    assert.equal(log.downloads.length, 1)
    assert.equal(log.uploads.length, 1)
    assert.deepEqual(a, b)
    assert.deepEqual(b, c)
    assert.deepEqual(a, { ok: true, header: { type: 'image', mediaId: 'media_1' } })
  })

  await check('unduh 403 → refresh dari Graph → simpan URL baru → unduh ulang → sukses', async () => {
    const { deps, log } = fakeDeps({
      download: async (url) => {
        log.downloads.push(url)
        if (url === CDN_URL) return { ok: false, status: 403, error: 'HTTP 403' }
        return { ok: true, bytes: JPEG, contentType: 'application/octet-stream' }
      },
    })
    const r = await resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps })
    assert.deepEqual(r, { ok: true, header: { type: 'image', mediaId: 'media_1' } })
    assert.deepEqual(log.downloads, [CDN_URL, CDN_URL_FRESH])
    assert.deepEqual(log.refreshes, ['meta_123'])
    assert.deepEqual(log.saves, [{ templateId: 'tpl_1', oldUrl: CDN_URL, newUrl: CDN_URL_FRESH }])
    // MIME ditebak dari magic bytes saat CDN membalas octet-stream.
    assert.equal(log.uploads[0]?.mime, 'image/jpeg')
  })

  await check('unduh gagal & refresh juga gagal → ok:false pesan jelas, tanpa upload', async () => {
    const origError = console.error
    console.error = () => undefined
    try {
      const { deps, log } = fakeDeps({
        download: async (url) => {
          log.downloads.push(url)
          return { ok: false, status: 403, error: 'HTTP 403' }
        },
      })
      const r = await resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps })
      assert.equal(r.ok, false)
      assert.match(!r.ok ? r.error : '', /^Gambar header template tidak bisa diambil dari Meta/)
      assert.match(!r.ok ? r.error : '', /unggah ulang gambar di menu Template Meta/)
      assert.equal(log.downloads.length, 2) // URL lama + URL hasil refresh
      assert.equal(log.uploads.length, 0)
    } finally {
      console.error = origError
    }
  })

  await check('refresh Graph tidak memberi URL → ok:false tanpa unduh ulang', async () => {
    const origError = console.error
    console.error = () => undefined
    try {
      const { deps, log } = fakeDeps({
        download: async (url) => {
          log.downloads.push(url)
          return { ok: false, status: 410, error: 'HTTP 410' }
        },
        fetchTemplateHeaderUrl: async (id) => {
          log.refreshes.push(id)
          return null
        },
      })
      const r = await resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps })
      assert.equal(r.ok, false)
      assert.equal(log.downloads.length, 1)
      assert.equal(log.saves.length, 0)
    } finally {
      console.error = origError
    }
  })

  await check('refresh memberi host non-CDN → tidak diunduh, tidak disimpan', async () => {
    const origError = console.error
    console.error = () => undefined
    try {
      const { deps, log } = fakeDeps({
        download: async (url) => {
          log.downloads.push(url)
          return { ok: false, status: 403, error: 'HTTP 403' }
        },
        fetchTemplateHeaderUrl: async () => 'http://169.254.169.254/latest/meta-data',
      })
      const r = await resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps })
      assert.equal(r.ok, false)
      assert.deepEqual(log.downloads, [CDN_URL])
      assert.equal(log.saves.length, 0)
    } finally {
      console.error = origError
    }
  })

  await check('isi bukan gambar (HTML) → ok:false, tanpa upload', async () => {
    const origError = console.error
    console.error = () => undefined
    try {
      const { deps, log } = fakeDeps({
        download: async (url) => {
          log.downloads.push(url)
          return { ok: true, bytes: Buffer.from('<html>login</html>'), contentType: 'text/html' }
        },
      })
      const r = await resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps })
      assert.equal(r.ok, false)
      assert.equal(log.uploads.length, 0)
    } finally {
      console.error = origError
    }
  })

  await check('upload ke Meta gagal → ok:false, tidak di-cache (percobaan berikut upload lagi)', async () => {
    const origError = console.error
    console.error = () => undefined
    try {
      let fail = true
      const { deps, log } = fakeDeps()
      const baseUpload = deps.upload
      deps.upload = async (input) => {
        if (fail) {
          log.uploads.push({ mime: input.mime, size: input.buffer.length })
          return { ok: false, error: { message: 'Meta down', code: 1 } }
        }
        return baseUpload(input)
      }
      const r1 = await resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps })
      assert.equal(r1.ok, false)
      fail = false
      const r2 = await resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps })
      assert.equal(r2.ok, true)
      assert.equal(log.uploads.length, 2)
    } finally {
      console.error = origError
    }
  })

  await check('VIDEO & DOCUMENT → jenis + label pesan sesuai, dokumen diberi nama file', async () => {
    const origError = console.error
    console.error = () => undefined
    try {
      const pdf = Buffer.from('%PDF-1.7\n')
      const { deps, log } = fakeDeps({
        download: async (url) => {
          log.downloads.push(url)
          return { ok: true, bytes: pdf, contentType: 'application/pdf' }
        },
      })
      const doc = await resolveTemplateHeaderMedia({ ...BASE, template: tpl({ headerType: 'DOCUMENT' }), deps })
      assert.deepEqual(doc, {
        ok: true,
        header: { type: 'document', mediaId: 'media_1', filename: 'broadcastantimarketplace1.pdf' },
      })
      assert.equal(log.uploads[0]?.mime, 'application/pdf')

      clearHeaderMediaCache()
      // PDF di header VIDEO → tidak cocok jenis → pesan "Video ..."
      const vid = await resolveTemplateHeaderMedia({ ...BASE, template: tpl({ headerType: 'VIDEO' }), deps })
      assert.equal(vid.ok, false)
      assert.match(!vid.ok ? vid.error : '', /^Video header template/)
    } finally {
      console.error = origError
    }
  })

  await check('deps melempar error → NEVER throw, ok:false', async () => {
    const origError = console.error
    console.error = () => undefined
    try {
      const { deps } = fakeDeps({
        download: async () => {
          throw new Error('boom')
        },
      })
      const r = await resolveTemplateHeaderMedia({ ...BASE, template: tpl(), deps })
      assert.equal(r.ok, false)
    } finally {
      console.error = origError
    }
  })

  console.log(`\nwaba/header-media-resolver: ${passed} pemeriksaan lolos`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
