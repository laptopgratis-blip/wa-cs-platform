// Helper untuk endpoint /api/admin/profitability/* — parse range, hitung
// previous range, format CSV.
//
// Query agregasi pakai $queryRaw karena harus JOIN Message → WhatsappSession
// → AiModel/User, dan Prisma groupBy tidak support join.

export interface DateRange {
  from: Date
  to: Date
}

export function parseRange(searchParams: URLSearchParams): DateRange {
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')
  const now = new Date()
  // Default: 7 hari terakhir.
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const from = fromStr ? new Date(fromStr) : defaultFrom
  const to = toStr ? new Date(toStr) : now
  // Kalau parse gagal (NaN), fallback ke default supaya endpoint tidak crash.
  return {
    from: Number.isFinite(from.getTime()) ? from : defaultFrom,
    to: Number.isFinite(to.getTime()) ? to : now,
  }
}

// Hitung range sebelumnya dengan window yang sama, di-shift ke belakang.
// Dipakai di summary untuk hitung delta % vs periode sebelumnya.
export function previousRange(r: DateRange): DateRange {
  const span = r.to.getTime() - r.from.getTime()
  return {
    from: new Date(r.from.getTime() - span),
    to: new Date(r.from.getTime()),
  }
}

// Kategorikan margin → status emoji untuk dashboard. Threshold sama dengan
// yang dipakai di model form preview.
export type Status = 'AMAN' | 'TIPIS' | 'RUGI'
export function statusOf(marginPct: number, target: number): Status {
  if (!Number.isFinite(marginPct)) return 'RUGI'
  if (marginPct >= target) return 'AMAN'
  if (marginPct >= 20) return 'TIPIS'
  return 'RUGI'
}
