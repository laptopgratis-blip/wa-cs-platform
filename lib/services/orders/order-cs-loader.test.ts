// Uji pemuat CS order memakai tiruan database (tanpa Postgres): cakupan query
// per user, jumlah query minimal, dan sifat never-throw. `npm test`.
import assert from 'node:assert/strict'

import { type OrderCsDb, loadOrderCs } from './order-cs-loader'

let passed = 0
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

interface FakeProduct {
  id: string
  userId: string
  csSessionId: string | null
}

interface FakeSession {
  id: string
  userId: string
  phoneNumber: string | null
  status: 'CONNECTED' | 'DISCONNECTED' | 'PAUSED'
  isActive: boolean
  updatedAt: Date
}

const session = (o: Partial<FakeSession> & { id: string }): FakeSession => ({
  userId: 'u1',
  phoneNumber: '6281234567890',
  status: 'CONNECTED',
  isActive: true,
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  ...o,
})

// Tiruan tabel Product + WhatsappSession. `calls` mencatat nama query supaya
// uji bisa memastikan loader tidak membaca lebih dari yang perlu.
function fakeDb(products: FakeProduct[], sessions: FakeSession[]) {
  const calls: string[] = []
  const db: OrderCsDb = {
    product: {
      async findMany({ where }) {
        calls.push('product.findMany')
        return products
          .filter(
            (p) =>
              where.id.in.includes(p.id) &&
              p.userId === where.userId &&
              p.csSessionId !== null,
          )
          .map((p) => ({ id: p.id, csSessionId: p.csSessionId }))
      },
    },
    whatsappSession: {
      async findFirst({ where }) {
        calls.push('whatsappSession.findFirst')
        return (
          sessions.find(
            (s) => s.id === where.id && s.userId === where.userId,
          ) ?? null
        )
      },
      async findMany({ where }) {
        calls.push('whatsappSession.findMany')
        return sessions.filter(
          (s) =>
            s.userId === where.userId &&
            s.isActive === where.isActive &&
            s.phoneNumber !== null,
        )
      },
    },
  }
  return { db, calls }
}

const NONE = { preferredSessionId: null, csNumber: null }
const item = (productId: string) => ({ productId, name: 'x', qty: 1, price: 1 })

async function main(): Promise<void> {
  console.log('orders/order-cs-loader: loadOrderCs')

  await check(
    'order tanpa item ber-productId → tanpa query sama sekali',
    async () => {
      const { db, calls } = fakeDb([], [])
      for (const items of [[], null, 'rusak', [{ name: 'lama' }]]) {
        assert.deepEqual(await loadOrderCs({ userId: 'u1', items }, db), NONE)
      }
      assert.deepEqual(calls, [])
    },
  )

  await check('produk tanpa CS → satu query produk saja', async () => {
    const { db, calls } = fakeDb(
      [{ id: 'p1', userId: 'u1', csSessionId: null }],
      [session({ id: 's1' })],
    )
    assert.deepEqual(
      await loadOrderCs({ userId: 'u1', items: [item('p1')] }, db),
      NONE,
    )
    assert.deepEqual(calls, ['product.findMany'])
  })

  await check('sesi CS online → dipakai, tanpa membaca sesi lain', async () => {
    const { db, calls } = fakeDb(
      [{ id: 'p1', userId: 'u1', csSessionId: 'cs' }],
      [
        session({ id: 'cs' }),
        session({ id: 'lain', phoneNumber: '628999999999' }),
      ],
    )
    assert.deepEqual(
      await loadOrderCs({ userId: 'u1', items: [item('p1')] }, db),
      { preferredSessionId: 'cs', csNumber: '6281234567890' },
    )
    assert.deepEqual(calls, ['product.findMany', 'whatsappSession.findFirst'])
  })

  await check('multi-produk → CS item pertama yang ber-CS', async () => {
    const { db } = fakeDb(
      [
        { id: 'p1', userId: 'u1', csSessionId: null },
        { id: 'p2', userId: 'u1', csSessionId: 'cs2' },
        { id: 'p3', userId: 'u1', csSessionId: 'cs3' },
      ],
      [
        session({ id: 'cs2', phoneNumber: '6282222222222' }),
        session({ id: 'cs3', phoneNumber: '6283333333333' }),
      ],
    )
    const out = await loadOrderCs(
      { userId: 'u1', items: [item('p1'), item('p3'), item('p2')] },
      db,
    )
    assert.deepEqual(out, {
      preferredSessionId: 'cs3',
      csNumber: '6283333333333',
    })
  })

  await check(
    'sesi CS basi → sesi aktif bernomor sama milik user yang sama',
    async () => {
      const { db, calls } = fakeDb(
        [{ id: 'p1', userId: 'u1', csSessionId: 'lama' }],
        [
          session({ id: 'lama', status: 'DISCONNECTED', isActive: false }),
          session({ id: 'baru', updatedAt: new Date('2026-10-10T00:00:00Z') }),
          // Nomor sama tapi milik user LAIN — tidak boleh terpilih.
          session({
            id: 'asing',
            userId: 'u2',
            updatedAt: new Date('2026-10-11T00:00:00Z'),
          }),
        ],
      )
      assert.deepEqual(
        await loadOrderCs({ userId: 'u1', items: [item('p1')] }, db),
        { preferredSessionId: 'baru', csNumber: '6281234567890' },
      )
      assert.deepEqual(calls, [
        'product.findMany',
        'whatsappSession.findFirst',
        'whatsappSession.findMany',
      ])
    },
  )

  await check(
    'sesi CS offline tanpa padanan → preferred null, nomor CS tetap',
    async () => {
      const { db } = fakeDb(
        [{ id: 'p1', userId: 'u1', csSessionId: 'lama' }],
        [
          session({ id: 'lama', status: 'DISCONNECTED' }),
          session({ id: 'lain', phoneNumber: '628999999999' }),
        ],
      )
      assert.deepEqual(
        await loadOrderCs({ userId: 'u1', items: [item('p1')] }, db),
        { preferredSessionId: null, csNumber: '6281234567890' },
      )
    },
  )

  await check(
    'sesi CS DIHAPUS seller (isActive=false) tanpa padanan → tanpa CS sama sekali',
    async () => {
      const { db } = fakeDb(
        [{ id: 'p1', userId: 'u1', csSessionId: 'lama' }],
        [
          session({ id: 'lama', status: 'DISCONNECTED', isActive: false }),
          session({ id: 'lain', phoneNumber: '628999999999' }),
          // Nomor sama masih aktif di akun LAIN — bukan milik seller ini.
          session({ id: 'asing', userId: 'u2' }),
        ],
      )
      assert.deepEqual(
        await loadOrderCs({ userId: 'u1', items: [item('p1')] }, db),
        NONE,
      )
    },
  )

  await check(
    'sesi CS dihapus, nomor sama sudah didaftarkan lagi tapi sedang PAUSED → nomor CS tetap',
    async () => {
      const { db } = fakeDb(
        [{ id: 'p1', userId: 'u1', csSessionId: 'lama' }],
        [
          session({ id: 'lama', status: 'DISCONNECTED', isActive: false }),
          session({ id: 'baru', status: 'PAUSED' }),
        ],
      )
      assert.deepEqual(
        await loadOrderCs({ userId: 'u1', items: [item('p1')] }, db),
        { preferredSessionId: null, csNumber: '6281234567890' },
      )
    },
  )

  await check(
    'produk milik user lain diabaikan (order tidak bisa meminjam CS orang)',
    async () => {
      const { db } = fakeDb(
        [{ id: 'p1', userId: 'u2', csSessionId: 'cs' }],
        [session({ id: 'cs', userId: 'u2' })],
      )
      assert.deepEqual(
        await loadOrderCs({ userId: 'u1', items: [item('p1')] }, db),
        NONE,
      )
    },
  )

  await check('sesi CS bukan milik pemilik order → diabaikan', async () => {
    const { db } = fakeDb(
      [{ id: 'p1', userId: 'u1', csSessionId: 'cs' }],
      [session({ id: 'cs', userId: 'u2' })],
    )
    assert.deepEqual(
      await loadOrderCs({ userId: 'u1', items: [item('p1')] }, db),
      NONE,
    )
  })

  await check('database error → tidak melempar, kembali tanpa CS', async () => {
    const boom: OrderCsDb = {
      product: {
        findMany: async () => {
          throw new Error('koneksi putus')
        },
      },
      whatsappSession: {
        findFirst: async () => null,
        findMany: async () => [],
      },
    }
    const originalError = console.error
    const logged: unknown[][] = []
    console.error = (...args: unknown[]) => {
      logged.push(args)
    }
    try {
      assert.deepEqual(
        await loadOrderCs({ userId: 'u1', items: [item('p1')] }, boom),
        NONE,
      )
    } finally {
      console.error = originalError
    }
    assert.equal(logged.length, 1, 'kegagalan wajib tercatat di log')
  })

  console.log(`orders/order-cs-loader: ${passed} ok`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
