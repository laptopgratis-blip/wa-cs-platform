// Uji grid 7×24 "jam ramai" LP Lab (SQL + pemetaan bucket). Jalankan lewat
// `npm test`. Semantik SQL-nya sendiri sudah dibuktikan di Postgres: kunjungan
// 2026-10-20T01:00Z → dow 2 (Selasa), hour 8 — sama di sesi UTC maupun WIB.
import assert from 'node:assert/strict'

import {
  TIME_OF_DAY_SQL,
  type TimeOfDayRow,
  toTimeOfDayCells,
  wibWallClockSql,
} from './time-of-day'

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const WIB_CREATED_AT = `(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')`

console.log('lp/time-of-day')

check('kolom tanpa zona ditandai UTC dulu, baru dikonversi ke WIB', () => {
  assert.equal(wibWallClockSql('createdAt'), WIB_CREATED_AT)
})

check('nama kolom selain identifier polos ditolak', () => {
  for (const bad of [
    '',
    'createdAt"; DROP TABLE x; --',
    'a b',
    '1abc',
    '"x"',
  ]) {
    assert.throws(() => wibWallClockSql(bad), /kolom/i, bad)
  }
})

check('hari DAN jam sama-sama diambil dari jam dinding WIB', () => {
  assert.ok(TIME_OF_DAY_SQL.includes(`EXTRACT(DOW FROM ${WIB_CREATED_AT})`))
  assert.ok(TIME_OF_DAY_SQL.includes(`EXTRACT(HOUR FROM ${WIB_CREATED_AT})`))
})

check('pola lama yang bergeser tidak muncul lagi', () => {
  // `"createdAt" AT TIME ZONE 'Asia/Jakarta'` pada kolom tanpa zona = anggap
  // nilainya sudah WIB → jam bergeser; DOW mentah = hari versi UTC.
  assert.doesNotMatch(
    TIME_OF_DAY_SQL,
    /"createdAt"\s+AT TIME ZONE 'Asia\/Jakarta'/,
  )
  assert.doesNotMatch(TIME_OF_DAY_SQL, /EXTRACT\(\s*DOW FROM "createdAt"\s*\)/)
})

check(
  'filter rentang tetap di kolom mentah (pakai index) & bot dibuang',
  () => {
    assert.match(TIME_OF_DAY_SQL, /"landingPageId" = \$1/)
    // param Date (dikirim Prisma sbg timestamptz) → jam UTC tanpa zona, sejenis
    // dengan kolom; tanpa ini rentang bergeser kalau TimeZone sesi bukan UTC.
    assert.ok(
      TIME_OF_DAY_SQL.includes(
        `"createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC')`,
      ),
    )
    assert.ok(
      TIME_OF_DAY_SQL.includes(
        `"createdAt" <= ($3::timestamptz AT TIME ZONE 'UTC')`,
      ),
    )
    assert.doesNotMatch(TIME_OF_DAY_SQL, /\$4/)
    assert.match(
      TIME_OF_DAY_SQL,
      /"deviceType" IS NULL OR "deviceType" != 'BOT'/,
    )
    assert.match(TIME_OF_DAY_SQL, /GROUP BY dow, hour/)
  },
)

check('baris SQL dipetakan ke sel { dow, hour, count }', () => {
  assert.deepEqual(
    toTimeOfDayCells([
      { dow: 2, hour: 8, cnt: 5 },
      { dow: 0, hour: 0, cnt: 1 },
      { dow: 6, hour: 23, cnt: 12 },
    ]),
    [
      { dow: 2, hour: 8, count: 5 },
      { dow: 0, hour: 0, count: 1 },
      { dow: 6, hour: 23, count: 12 },
    ],
  )
})

check('angka bigint dari driver ikut dikonversi', () => {
  assert.deepEqual(
    toTimeOfDayCells([{ dow: BigInt(2), hour: BigInt(8), cnt: BigInt(3) }]),
    [{ dow: 2, hour: 8, count: 3 }],
  )
})

check('baris di luar grid 7×24 atau hitungan tak wajar dibuang', () => {
  assert.deepEqual(
    toTimeOfDayCells([
      { dow: 7, hour: 1, cnt: 1 },
      { dow: -1, hour: 1, cnt: 1 },
      { dow: 1, hour: 24, cnt: 1 },
      { dow: 1, hour: 1.5, cnt: 1 },
      { dow: 1, hour: 1, cnt: 0 },
      { dow: 1, hour: 1, cnt: Number.NaN },
      // null/teks jangan diam-diam jadi 0 (= Minggu / jam 00)
      { dow: null, hour: 1, cnt: 1 } as unknown as TimeOfDayRow,
      { dow: 1, hour: '' as unknown as number, cnt: 1 },
      { dow: 3, hour: 9, cnt: 2 },
    ]),
    [{ dow: 3, hour: 9, count: 2 }],
  )
})

check('input tidak dimutasi', () => {
  const rows = Object.freeze([Object.freeze({ dow: 1, hour: 2, cnt: 3 })])
  toTimeOfDayCells(rows)
  assert.deepEqual(rows, [{ dow: 1, hour: 2, cnt: 3 }])
})

console.log(`lp/time-of-day: ${passed} ok`)
