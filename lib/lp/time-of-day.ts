// Grid 7×24 "jam ramai" LP Lab (PURE, tanpa prisma) — SQL & pemetaan bucket
// dipisah dari route supaya bisa dites tanpa DB.
//
// LpVisit.createdAt bertipe TIMESTAMP(3) TANPA zona dan diisi Prisma dengan
// jam UTC. Pada kolom tanpa zona, `x AT TIME ZONE 'Asia/Jakarta'` justru
// menganggap x SUDAH jam Jakarta → jam bergeser (dulu 01:00Z tampil jam 18,
// bukan 08), dan DOW mentah memakai hari versi UTC. Benar: tandai dulu sebagai
// UTC (→ timestamptz), baru ambil jam dinding WIB — hasilnya tidak bergantung
// pada TimeZone sesi Postgres.

export const LP_ANALYTICS_TIME_ZONE = 'Asia/Jakarta'

const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Ekspresi SQL jam dinding WIB untuk kolom timestamp-tanpa-zona berisi UTC. */
export function wibWallClockSql(column: string): string {
  if (!SQL_IDENTIFIER.test(column)) {
    throw new Error(`Nama kolom tidak valid: ${JSON.stringify(column)}`)
  }
  return `(("${column}" AT TIME ZONE 'UTC') AT TIME ZONE '${LP_ANALYTICS_TIME_ZONE}')`
}

const CREATED_AT_WIB = wibWallClockSql('createdAt')

// Prisma mengirim Date di raw query sebagai timestamptz; dibandingkan langsung
// dengan kolom tanpa zona, Postgres menafsirkan kolom pakai TimeZone sesi →
// rentang bergeser kalau sesi bukan UTC. Jadi param diubah ke jam UTC tanpa
// zona, dan kolom dibiarkan mentah supaya index (landingPageId, createdAt)
// tetap terpakai.
const utcParamSql = (n: number) => `($${n}::timestamptz AT TIME ZONE 'UTC')`

// Param: $1 landingPageId, $2 from, $3 to (Date).
export const TIME_OF_DAY_SQL = `SELECT EXTRACT(DOW FROM ${CREATED_AT_WIB})::int AS dow,
       EXTRACT(HOUR FROM ${CREATED_AT_WIB})::int AS hour,
       COUNT(*)::int AS cnt
FROM "LpVisit"
WHERE "landingPageId" = $1
  AND "createdAt" >= ${utcParamSql(2)}
  AND "createdAt" <= ${utcParamSql(3)}
  AND ("deviceType" IS NULL OR "deviceType" != 'BOT')
GROUP BY dow, hour
ORDER BY dow, hour`

type SqlInt = number | bigint

export interface TimeOfDayRow {
  dow: SqlInt
  hour: SqlInt
  cnt: SqlInt
}

/** dow: 0=Minggu … 6=Sabtu (konvensi EXTRACT(DOW)); hour: 0-23 WIB. */
export interface TimeOfDayCell {
  dow: number
  hour: number
  count: number
}

function isIntInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}

// Hanya number/bigint yang sah — Number(null) / Number('') = 0 akan diam-diam
// jadi Minggu / jam 00.
function toSqlNumber(value: unknown): number {
  return typeof value === 'number' || typeof value === 'bigint'
    ? Number(value)
    : Number.NaN
}

/** Baris hasil TIME_OF_DAY_SQL → sel heatmap; baris di luar grid dibuang. */
export function toTimeOfDayCells(
  rows: readonly TimeOfDayRow[],
): TimeOfDayCell[] {
  return rows
    .map((r) => ({
      dow: toSqlNumber(r.dow),
      hour: toSqlNumber(r.hour),
      count: toSqlNumber(r.cnt),
    }))
    .filter(
      (c) =>
        isIntInRange(c.dow, 0, 6) &&
        isIntInRange(c.hour, 0, 23) &&
        isIntInRange(c.count, 1, Number.MAX_SAFE_INTEGER),
    )
}
