// Uji pemilihan lampiran knowledge per transport + prompt yang tidak
// menjanjikan file yang tak bisa dikirim. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import {
  formatKnowledgeForPrompt,
  type RetrievedKnowledge,
} from '../knowledge-retriever'
import {
  type KnowledgeAttachment,
  selectKnowledgeAttachments,
  sendAttachmentsWithinBudget,
} from './attachments'

let passed = 0
async function check(
  name: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

function kb(over: Partial<RetrievedKnowledge>): RetrievedKnowledge {
  return {
    id: 'k1',
    title: 'Testimoni Pengguna Mobil',
    contentType: 'IMAGE',
    textContent: null,
    fileUrl: '/uploads/knowledge/u1/a.jpg',
    linkUrl: null,
    caption: 'Foto testimoni mobil',
    ...over,
  }
}

const PROMISE = 'auto-kirim setelah balasanmu'

async function main(): Promise<void> {
  console.log('cs-pipeline/attachments: selectKnowledgeAttachments')

  await check(
    'tanpa predicate → semua IMAGE/FILE ber-fileUrl (perilaku Baileys lama)',
    () => {
      const items = [
        kb({ id: 'img' }),
        kb({
          id: 'file',
          contentType: 'FILE',
          fileUrl: '/uploads/knowledge/u1/k.pdf',
        }),
        kb({
          id: 'text',
          contentType: 'TEXT',
          fileUrl: null,
          textContent: 'FAQ',
        }),
        kb({ id: 'nofile', fileUrl: null }),
        kb({
          id: 'link',
          contentType: 'LINK',
          fileUrl: null,
          linkUrl: 'https://x.id',
        }),
      ]
      const res = selectKnowledgeAttachments(items)
      assert.deepEqual(
        res.map((a) => a.id),
        ['img', 'file'],
      )
      assert.deepEqual(res[0], {
        id: 'img',
        fileUrl: '/uploads/knowledge/u1/a.jpg',
        title: 'Testimoni Pengguna Mobil',
        caption: 'Foto testimoni mobil',
        contentType: 'IMAGE',
      })
    },
  )

  await check(
    'predicate menyaring lampiran yang tak bisa dikirim transport ini',
    () => {
      const items = [
        kb({ id: 'a' }),
        kb({ id: 'b', fileUrl: '/uploads/knowledge/u1/b.exe' }),
      ]
      const res = selectKnowledgeAttachments(items, (att) =>
        att.fileUrl.endsWith('.jpg'),
      )
      assert.deepEqual(
        res.map((a) => a.id),
        ['a'],
      )
    },
  )

  await check('predicate selalu false → tidak ada lampiran', () => {
    assert.deepEqual(
      selectKnowledgeAttachments([kb({})], () => false),
      [],
    )
  })

  console.log('knowledge-retriever: formatKnowledgeForPrompt')

  await check(
    'default (tanpa attachableIds) tetap menjanjikan kirim file — paritas Baileys',
    () => {
      const text = formatKnowledgeForPrompt([kb({})])
      assert.ok(text.includes(PROMISE))
    },
  )

  await check(
    'attachableIds kosong → TIDAK ada janji kirim file sama sekali',
    () => {
      const text = formatKnowledgeForPrompt(
        [kb({}), kb({ id: 'k2', contentType: 'FILE', caption: null })],
        {
          attachableIds: new Set<string>(),
        },
      )
      assert.ok(!text.includes(PROMISE))
      assert.ok(!text.includes('auto-attach'))
      assert.ok(!text.includes('(lihat file/link terlampir)'))
      // Caption tetap dipakai sebagai konteks teks.
      assert.ok(text.includes('Foto testimoni mobil'))
    },
  )

  await check('hanya entry di attachableIds yang dijanjikan', () => {
    const text = formatKnowledgeForPrompt(
      [kb({ id: 'ok', title: 'Bisa' }), kb({ id: 'no', title: 'Tidak' })],
      {
        attachableIds: new Set(['ok']),
      },
    )
    assert.ok(text.includes('File "Bisa" auto-kirim'))
    assert.ok(!text.includes('File "Tidak" auto-kirim'))
  })

  await check(
    'file tak terkirim ditandai eksplisit supaya AI tidak menjanjikannya',
    () => {
      const text = formatKnowledgeForPrompt(
        [
          kb({ id: 'ok', title: 'Bisa' }),
          kb({ id: 'no', title: 'Tidak', caption: 'Brosur harga' }),
        ],
        { attachableIds: new Set(['ok']) },
      )
      assert.ok(text.includes('File "Tidak" TIDAK ikut terkirim'))
      assert.ok(!text.includes('File "Bisa" TIDAK ikut terkirim'))
    },
  )

  await check(
    'default (Baileys) tidak memuat penanda TIDAK ikut terkirim',
    () => {
      const text = formatKnowledgeForPrompt([kb({})])
      assert.ok(!text.includes('TIDAK ikut terkirim'))
    },
  )

  console.log('cs-pipeline/attachments: sendAttachmentsWithinBudget')

  function att(id: string): KnowledgeAttachment {
    return {
      id,
      fileUrl: `/uploads/knowledge/u1/${id}.jpg`,
      title: id,
      caption: null,
      contentType: 'IMAGE',
    }
  }

  await check(
    'kirim berurutan, satu gagal/throw tidak menghentikan yang lain',
    async () => {
      const order: string[] = []
      const res = await sendAttachmentsWithinBudget({
        attachments: [att('a'), att('b'), att('c')],
        budgetMs: 10_000,
        now: () => 0,
        send: async (a) => {
          order.push(a.id)
          if (a.id === 'a')
            return { ok: false, externalMsgId: null, error: 'ditolak' }
          if (a.id === 'b') throw new Error('meledak')
          return { ok: true, externalMsgId: 'w-c' }
        },
      })
      assert.deepEqual(order, ['a', 'b', 'c'])
      assert.deepEqual(
        res.sent.map((a) => a.id),
        ['c'],
      )
      assert.deepEqual(
        res.failed.map((f) => f.attachment.id),
        ['a', 'b'],
      )
      assert.equal(res.failed[0].error, 'ditolak')
      assert.equal(res.failed[1].error, 'meledak')
      assert.deepEqual(res.skipped, [])
    },
  )

  await check('maksimal 3 lampiran per balasan; sisanya skipped', async () => {
    let calls = 0
    const res = await sendAttachmentsWithinBudget({
      attachments: [att('a'), att('b'), att('c'), att('d')],
      budgetMs: 10_000,
      now: () => 0,
      send: async () => {
        calls += 1
        return { ok: true, externalMsgId: 'w' }
      },
    })
    assert.equal(calls, 3)
    assert.deepEqual(
      res.skipped.map((a) => a.id),
      ['d'],
    )
  })

  await check(
    'anggaran waktu habis → lampiran berikutnya tidak dimulai (lock per-kontak aman)',
    async () => {
      let clock = 0
      const res = await sendAttachmentsWithinBudget({
        attachments: [att('a'), att('b')],
        budgetMs: 20_000,
        now: () => clock,
        send: async () => {
          clock += 25_000 // upload lambat
          return { ok: true, externalMsgId: 'w' }
        },
      })
      assert.deepEqual(
        res.sent.map((a) => a.id),
        ['a'],
      )
      assert.deepEqual(
        res.skipped.map((a) => a.id),
        ['b'],
      )
    },
  )

  await check('daftar kosong → tidak memanggil send', async () => {
    const res = await sendAttachmentsWithinBudget({
      attachments: [],
      budgetMs: 1,
      send: async () => {
        throw new Error('tidak boleh dipanggil')
      },
    })
    assert.deepEqual(res, { sent: [], failed: [], skipped: [] })
  })

  console.log(`\ncs-pipeline/attachments: ${passed} pemeriksaan lolos`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
