// Uji refreshQueueItem — penyegaran SATU item antrean follow-up setelah data
// pelanggan pesanan diedit. Jalankan lewat `npm test`.
// Tanpa database: `db` diganti tiruan in-memory yang meniru semantik
// `updateMany` Prisma (where = AND seluruh kolom, hasil = jumlah baris).
import assert from 'node:assert/strict'

import { Prisma, type UserOrder } from '@prisma/client'

import {
  type PendingQueueItem,
  type QueueRefreshDb,
  refreshQueueItem,
} from './followup-order-refresh-item'
import {
  type ResolveContext,
  resolveTemplateVariables,
} from './followup-variables'

let passed = 0
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

interface FakeRow {
  id: string
  status: string
  customerPhone: string
  resolvedMessage: string
  resolvedParams: unknown
}

type UpdateManyArgs = Parameters<
  QueueRefreshDb['followUpQueue']['updateMany']
>[0]

// Tiruan tabel FollowUpQueue. `calls` mencatat setiap updateMany supaya uji
// bisa memastikan guard (status / resolvedMessage) benar-benar dikirim.
function fakeDb(rows: FakeRow[]) {
  const calls: UpdateManyArgs[] = []
  const db: QueueRefreshDb = {
    followUpQueue: {
      async updateMany(args) {
        calls.push(args)
        const { where, data } = args
        let count = 0
        for (const [index, row] of rows.entries()) {
          const matches =
            row.id === where.id &&
            row.status === where.status &&
            (where.resolvedMessage === undefined ||
              row.resolvedMessage === where.resolvedMessage)
          if (!matches) continue
          rows[index] = { ...row, ...data }
          count += 1
        }
        return { count }
      },
    },
  }
  return { db, calls, row: (id: string) => rows.find((r) => r.id === id) }
}

// Hanya kolom yang dibaca resolver; sisanya tidak relevan untuk uji ini.
function order(over: Partial<UserOrder>): UserOrder {
  return {
    id: 'order-1',
    customerName: 'Budi',
    customerPhone: '6281234567890',
    invoiceNumber: 'INV-001',
    totalRp: 150000,
    items: [],
    shippingAddress: 'Jl. Mawar No. 5',
    shippingCityName: 'Bandung',
    shippingProvinceName: 'Jawa Barat',
    shippingPostalCode: '40123',
    shippingEtd: null,
    shippingCourier: null,
    trackingNumber: null,
    ...over,
  } as unknown as UserOrder
}

function ctx(o: UserOrder): ResolveContext {
  return {
    order: o,
    user: { id: 'user-1', name: 'Toko Budi' },
    bankAccounts: [],
    shippingProfile: null,
  }
}

const TEMPLATE = 'Halo {nama}, paket dikirim ke {alamat}.'
const OLD_ORDER = order({})
const NEW_ORDER = order({
  customerName: 'Budi Santoso',
  customerPhone: '6285711112222',
  shippingAddress: 'Jl. Melati No. 7',
  shippingPostalCode: '40555',
})
const OLD_CTX = ctx(OLD_ORDER)
const NEW_CTX = ctx(NEW_ORDER)
const OLD_MESSAGE = resolveTemplateVariables(TEMPLATE, OLD_CTX)
const NEW_MESSAGE = resolveTemplateVariables(TEMPLATE, NEW_CTX)
const NEW_PHONE = NEW_ORDER.customerPhone
const STALE_PARAMS = ['Budi', 'Jl. Mawar No. 5']

function pendingRow(over: Partial<FakeRow> = {}): FakeRow {
  return {
    id: 'q1',
    status: 'PENDING',
    customerPhone: OLD_ORDER.customerPhone,
    resolvedMessage: OLD_MESSAGE,
    resolvedParams: STALE_PARAMS,
    ...over,
  }
}

// Item seperti yang dibaca service (snapshot saat findMany).
function itemOf(row: FakeRow): PendingQueueItem {
  return {
    id: row.id,
    resolvedMessage: row.resolvedMessage,
    template: { message: TEMPLATE },
  }
}

async function main(): Promise<void> {
  console.log('followup-order-refresh-item: refreshQueueItem')

  await check('prasyarat: pesan lama & baru memang berbeda', async () => {
    assert.equal(
      OLD_MESSAGE,
      'Halo Budi, paket dikirim ke Jl. Mawar No. 5, Bandung, Jawa Barat, 40123.',
    )
    assert.equal(
      NEW_MESSAGE,
      'Halo Budi Santoso, paket dikirim ke Jl. Melati No. 7, Bandung, Jawa Barat, 40555.',
    )
  })

  await check(
    'pesan belum diedit manual → pesan, nomor & param diperbarui',
    async () => {
      const row = pendingRow()
      const { db, calls, row: get } = fakeDb([row])
      const outcome = await refreshQueueItem(
        db,
        itemOf(row),
        NEW_PHONE,
        OLD_CTX,
        NEW_CTX,
      )
      assert.equal(outcome, 'refreshed')
      assert.deepEqual(get('q1'), {
        id: 'q1',
        status: 'PENDING',
        customerPhone: NEW_PHONE,
        resolvedMessage: NEW_MESSAGE,
        resolvedParams: Prisma.DbNull,
      })
      assert.equal(calls.length, 1)
      // Optimistic lock: tulis hanya bila pesan masih sama dengan yang dibaca.
      assert.deepEqual(calls[0]?.where, {
        id: 'q1',
        status: 'PENDING',
        resolvedMessage: OLD_MESSAGE,
      })
    },
  )

  await check(
    'pesan sudah diedit manual → pesan DIBIARKAN, nomor & param diperbarui',
    async () => {
      const manual = 'Halo Pak Budi, ada promo khusus hari ini.'
      const row = pendingRow({ resolvedMessage: manual })
      const { db, calls, row: get } = fakeDb([row])
      const outcome = await refreshQueueItem(
        db,
        itemOf(row),
        NEW_PHONE,
        OLD_CTX,
        NEW_CTX,
      )
      assert.equal(outcome, 'kept')
      assert.equal(get('q1')?.resolvedMessage, manual)
      assert.equal(get('q1')?.customerPhone, NEW_PHONE)
      assert.equal(get('q1')?.resolvedParams, Prisma.DbNull)
      // Tidak ada upaya menimpa pesan sama sekali.
      assert.equal(calls.length, 1)
      assert.equal('resolvedMessage' in (calls[0]?.data ?? {}), false)
    },
  )

  await check(
    'seller mengedit pesan di antara baca & tulis → editan tidak tertimpa',
    async () => {
      const snapshot = pendingRow()
      const item = itemOf(snapshot)
      // Setelah service membaca item, seller menyimpan editan manual.
      const edited = 'Halo Budi, pesanan segera kami kirim ya.'
      const {
        db,
        calls,
        row: get,
      } = fakeDb([{ ...snapshot, resolvedMessage: edited }])
      const outcome = await refreshQueueItem(
        db,
        item,
        NEW_PHONE,
        OLD_CTX,
        NEW_CTX,
      )
      assert.equal(outcome, 'kept')
      assert.equal(get('q1')?.resolvedMessage, edited)
      assert.equal(get('q1')?.customerPhone, NEW_PHONE)
      assert.equal(get('q1')?.resolvedParams, Prisma.DbNull)
      assert.equal(calls.length, 2)
    },
  )

  for (const status of ['SENT', 'FAILED', 'SKIPPED', 'CANCELLED']) {
    await check(
      `item sudah ${status} (bukan PENDING lagi) → tidak disentuh`,
      async () => {
        const snapshot = pendingRow()
        const item = itemOf(snapshot)
        const now = { ...snapshot, status }
        const { db, row: get } = fakeDb([now])
        const outcome = await refreshQueueItem(
          db,
          item,
          NEW_PHONE,
          OLD_CTX,
          NEW_CTX,
        )
        assert.equal(outcome, 'gone')
        assert.deepEqual(get('q1'), now)
      },
    )
  }

  await check('hanya baris item itu yang berubah', async () => {
    const target = pendingRow()
    const other = pendingRow({ id: 'q2' })
    const { db, row: get } = fakeDb([target, other])
    await refreshQueueItem(db, itemOf(target), NEW_PHONE, OLD_CTX, NEW_CTX)
    assert.deepEqual(get('q2'), other)
  })

  await check(
    'hanya nomor yang berubah (pesan sama) → tetap "refreshed", pesan utuh',
    async () => {
      const phoneOnly = ctx(order({ customerPhone: NEW_PHONE }))
      const row = pendingRow()
      const { db, row: get } = fakeDb([row])
      const outcome = await refreshQueueItem(
        db,
        itemOf(row),
        NEW_PHONE,
        OLD_CTX,
        phoneOnly,
      )
      assert.equal(outcome, 'refreshed')
      assert.equal(get('q1')?.resolvedMessage, OLD_MESSAGE)
      assert.equal(get('q1')?.customerPhone, NEW_PHONE)
      assert.equal(get('q1')?.resolvedParams, Prisma.DbNull)
    },
  )

  console.log(`\n${passed} uji lulus`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
