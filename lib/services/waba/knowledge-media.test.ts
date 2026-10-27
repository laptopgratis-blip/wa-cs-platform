// Uji perencana & pemuat lampiran knowledge untuk Cloud API (tanpa disk/sharp
// asli — deps ditiru). Jalankan lewat `npm test`.
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  CLOUD_IMAGE_MAX_BYTES,
  isKnowledgeMediaAvailable,
  type KnowledgeMediaDeps,
  loadKnowledgeMedia,
  planKnowledgeMedia,
} from './knowledge-media'

let passed = 0
async function check(
  name: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const OWNER = 'cmouyti1h0000mohww6o39srm'

function att(
  fileUrl: string,
  contentType = 'IMAGE',
  title = 'Testimoni Pengguna Mobil',
) {
  return { fileUrl, contentType, title }
}

async function main(): Promise<void> {
  console.log('waba/knowledge-media: planKnowledgeMedia')

  await check('IMAGE jpg/png → kirim sebagai image apa adanya', () => {
    const jpg = planKnowledgeMedia(
      att(`/uploads/knowledge/${OWNER}/c7933c0bd531ad60df2e.jpg`),
      OWNER,
    )
    assert.deepEqual(
      jpg && { kind: jpg.kind, mime: jpg.mime, convert: jpg.convertToJpeg },
      {
        kind: 'image',
        mime: 'image/jpeg',
        convert: false,
      },
    )
    const png = planKnowledgeMedia(
      att(`/uploads/knowledge/${OWNER}/a1.png`),
      OWNER,
    )
    assert.equal(png?.mime, 'image/png')
    assert.equal(png?.convertToJpeg, false)
    assert.equal(
      png?.relPath,
      path.join('uploads', 'knowledge', OWNER, 'a1.png'),
    )
  })

  await check(
    'IMAGE webp/gif → dikonversi ke JPEG (Cloud hanya terima jpeg/png)',
    () => {
      for (const ext of ['webp', 'gif']) {
        const plan = planKnowledgeMedia(
          att(`/uploads/knowledge/${OWNER}/x.${ext}`),
          OWNER,
        )
        assert.equal(plan?.kind, 'image')
        assert.equal(plan?.mime, 'image/jpeg')
        assert.equal(plan?.convertToJpeg, true)
      }
    },
  )

  await check(
    'FILE pdf/office/txt → document dengan nama file dari judul',
    () => {
      const pdf = planKnowledgeMedia(
        att(
          `/uploads/knowledge/${OWNER}/fac1a194aca216049808.pdf`,
          'FILE',
          'product knowledge teman baitullah',
        ),
        OWNER,
      )
      assert.equal(pdf?.kind, 'document')
      assert.equal(pdf?.mime, 'application/pdf')
      assert.equal(pdf?.filename, 'product knowledge teman baitullah.pdf')
      const docx = planKnowledgeMedia(
        att(`/uploads/knowledge/${OWNER}/k.docx`, 'FILE', 'Katalog'),
        OWNER,
      )
      assert.equal(
        docx?.mime,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
      const xlsx = planKnowledgeMedia(
        att(`/uploads/knowledge/${OWNER}/k.xlsx`, 'FILE', 'Harga'),
        OWNER,
      )
      assert.equal(
        xlsx?.mime,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      const txt = planKnowledgeMedia(
        att(`/uploads/knowledge/${OWNER}/k.txt`, 'FILE', 'Catatan'),
        OWNER,
      )
      assert.equal(txt?.mime, 'text/plain')
    },
  )

  await check(
    'FILE csv → text/plain (Meta tidak menerima text/csv), nama tetap .csv',
    () => {
      const csv = planKnowledgeMedia(
        att(`/uploads/knowledge/${OWNER}/k.csv`, 'FILE', 'Daftar harga'),
        OWNER,
      )
      assert.equal(csv?.mime, 'text/plain')
      assert.equal(csv?.filename, 'Daftar harga.csv')
    },
  )

  await check(
    'judul berkarakter aneh dibersihkan; judul kosong → nama default',
    () => {
      const odd = planKnowledgeMedia(
        att(
          `/uploads/knowledge/${OWNER}/k.pdf`,
          'FILE',
          '  Harga: "promo" / 2026?  ',
        ),
        OWNER,
      )
      assert.equal(odd?.filename, 'Harga promo 2026.pdf')
      const empty = planKnowledgeMedia(
        att(`/uploads/knowledge/${OWNER}/k.pdf`, 'FILE', '???'),
        OWNER,
      )
      assert.equal(empty?.filename, 'dokumen.pdf')
    },
  )

  await check(
    'path traversal, folder user lain, URL eksternal → ditolak (null)',
    () => {
      const rejected = [
        `/uploads/knowledge/${OWNER}/../../../etc/passwd.jpg`,
        `/uploads/knowledge/${OWNER}/..%2F..%2Fsecret.jpg`,
        `/uploads/knowledge/userlain123/foto.jpg`,
        `/uploads/products/${OWNER}/foto.jpg`,
        `https://contoh.com/uploads/knowledge/${OWNER}/foto.jpg`,
        `uploads/knowledge/${OWNER}/foto.jpg`,
        `/uploads/knowledge/${OWNER}/sub/foto.jpg`,
        '',
      ]
      for (const url of rejected) {
        assert.equal(planKnowledgeMedia(att(url), OWNER), null, url)
      }
    },
  )

  await check('tipe tak didukung / tak cocok dengan contentType → null', () => {
    assert.equal(
      planKnowledgeMedia(
        att(`/uploads/knowledge/${OWNER}/k.pdf`, 'IMAGE'),
        OWNER,
      ),
      null,
    )
    assert.equal(
      planKnowledgeMedia(
        att(`/uploads/knowledge/${OWNER}/k.jpg`, 'FILE'),
        OWNER,
      ),
      null,
    )
    assert.equal(
      planKnowledgeMedia(
        att(`/uploads/knowledge/${OWNER}/k.exe`, 'FILE'),
        OWNER,
      ),
      null,
    )
    assert.equal(
      planKnowledgeMedia(
        att(`/uploads/knowledge/${OWNER}/k.jpg`, 'LINK'),
        OWNER,
      ),
      null,
    )
  })

  console.log('waba/knowledge-media: loadKnowledgeMedia')

  const PUBLIC_DIR = '/app/public'

  function fakeDeps(
    over: Partial<KnowledgeMediaDeps> = {},
  ): KnowledgeMediaDeps & { reads: string[]; converted: number } {
    const state = { reads: [] as string[], converted: 0 }
    return Object.assign(state, {
      readFile: async (abs: string) => {
        state.reads.push(abs)
        return Buffer.from('isi-file')
      },
      toJpeg: async (buf: Buffer) => {
        state.converted += 1
        return Buffer.concat([Buffer.from('jpeg:'), buf])
      },
      ...over,
    })
  }

  await check(
    'baca file di bawah public/ lalu kembalikan buffer + mime',
    async () => {
      const plan = planKnowledgeMedia(
        att(`/uploads/knowledge/${OWNER}/a.jpg`),
        OWNER,
      )
      assert.ok(plan)
      const deps = fakeDeps()
      const res = await loadKnowledgeMedia(plan, PUBLIC_DIR, deps)
      assert.deepEqual(deps.reads, [
        path.join(PUBLIC_DIR, 'uploads', 'knowledge', OWNER, 'a.jpg'),
      ])
      assert.equal(deps.converted, 0)
      assert.ok(res.ok)
      if (res.ok) {
        assert.equal(res.kind, 'image')
        assert.equal(res.mime, 'image/jpeg')
        assert.equal(res.buffer.toString(), 'isi-file')
      }
    },
  )

  await check(
    'webp → toJpeg dipanggil sekali, hasil konversi yang dikirim',
    async () => {
      const plan = planKnowledgeMedia(
        att(`/uploads/knowledge/${OWNER}/a.webp`),
        OWNER,
      )
      assert.ok(plan)
      const deps = fakeDeps()
      const res = await loadKnowledgeMedia(plan, PUBLIC_DIR, deps)
      assert.equal(deps.converted, 1)
      assert.ok(res.ok && res.buffer.toString() === 'jpeg:isi-file')
    },
  )

  await check('file hilang → ok:false, tidak throw', async () => {
    const plan = planKnowledgeMedia(
      att(`/uploads/knowledge/${OWNER}/a.jpg`),
      OWNER,
    )
    assert.ok(plan)
    const res = await loadKnowledgeMedia(
      plan,
      PUBLIC_DIR,
      fakeDeps({
        readFile: async () => {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        },
      }),
    )
    assert.equal(res.ok, false)
  })

  await check('konversi gagal → ok:false, tidak throw', async () => {
    const plan = planKnowledgeMedia(
      att(`/uploads/knowledge/${OWNER}/a.gif`),
      OWNER,
    )
    assert.ok(plan)
    const res = await loadKnowledgeMedia(
      plan,
      PUBLIC_DIR,
      fakeDeps({
        toJpeg: async () => {
          throw new Error('format rusak')
        },
      }),
    )
    assert.equal(res.ok, false)
  })

  await check('gambar > 5 MB → ok:false (batas Meta)', async () => {
    const plan = planKnowledgeMedia(
      att(`/uploads/knowledge/${OWNER}/a.png`),
      OWNER,
    )
    assert.ok(plan)
    const res = await loadKnowledgeMedia(
      plan,
      PUBLIC_DIR,
      fakeDeps({
        readFile: async () => Buffer.alloc(CLOUD_IMAGE_MAX_BYTES + 1),
      }),
    )
    assert.equal(res.ok, false)
  })

  await check('file kosong → ok:false', async () => {
    const plan = planKnowledgeMedia(
      att(`/uploads/knowledge/${OWNER}/a.pdf`, 'FILE', 'Katalog'),
      OWNER,
    )
    assert.ok(plan)
    const res = await loadKnowledgeMedia(
      plan,
      PUBLIC_DIR,
      fakeDeps({ readFile: async () => Buffer.alloc(0) }),
    )
    assert.equal(res.ok, false)
  })

  console.log('waba/knowledge-media: isKnowledgeMediaAvailable')

  await check(
    'file ada & ukuran wajar → tersedia; path yang dicek di bawah public/',
    () => {
      const plan = planKnowledgeMedia(
        att(`/uploads/knowledge/${OWNER}/a.jpg`),
        OWNER,
      )
      assert.ok(plan)
      const seen: string[] = []
      const ok = isKnowledgeMediaAvailable(plan, PUBLIC_DIR, (abs) => {
        seen.push(abs)
        return 1000
      })
      assert.equal(ok, true)
      assert.deepEqual(seen, [
        path.join(PUBLIC_DIR, 'uploads', 'knowledge', OWNER, 'a.jpg'),
      ])
    },
  )

  await check(
    'file hilang / kosong → tidak tersedia (AI tidak dijanjikan)',
    () => {
      const plan = planKnowledgeMedia(
        att(`/uploads/knowledge/${OWNER}/a.jpg`),
        OWNER,
      )
      assert.ok(plan)
      assert.equal(
        isKnowledgeMediaAvailable(plan, PUBLIC_DIR, () => null),
        false,
      )
      assert.equal(
        isKnowledgeMediaAvailable(plan, PUBLIC_DIR, () => 0),
        false,
      )
    },
  )

  await check(
    'gambar jpg/png > 5 MB → tidak tersedia; webp besar dinilai setelah konversi',
    () => {
      const png = planKnowledgeMedia(
        att(`/uploads/knowledge/${OWNER}/a.png`),
        OWNER,
      )
      assert.ok(png)
      assert.equal(
        isKnowledgeMediaAvailable(
          png,
          PUBLIC_DIR,
          () => CLOUD_IMAGE_MAX_BYTES + 1,
        ),
        false,
      )
      const webp = planKnowledgeMedia(
        att(`/uploads/knowledge/${OWNER}/a.webp`),
        OWNER,
      )
      assert.ok(webp)
      assert.equal(
        isKnowledgeMediaAvailable(
          webp,
          PUBLIC_DIR,
          () => CLOUD_IMAGE_MAX_BYTES + 1,
        ),
        true,
      )
    },
  )

  console.log(`\nwaba/knowledge-media: ${passed} pemeriksaan lolos`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
