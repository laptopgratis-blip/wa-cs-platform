// LMS Drip — resolve apakah lesson udah ke-unlock berdasarkan
// dripDays (relative ke Enrollment.enrolledAt).
//
// Aturan:
//   - dripDays null      → unlock immediate (default Phase 1-3 behavior)
//   - dripDays = 0       → unlock immediate (sama dengan null)
//   - dripDays > 0       → unlock pada enrolledAt + dripDays
//
// Free preview lesson tidak terpengaruh drip — bisa dilihat anon visitor
// kapan saja. Ini sengaja: drip hanya berlaku untuk enrolled student.

export interface DripStatus {
  unlocked: boolean
  unlocksAt: Date | null // null kalau immediate / no drip
  daysRemaining: number // 0 kalau unlocked
}

export function resolveDripStatus(input: {
  enrolledAt: Date
  dripDays: number | null | undefined
  now?: Date
}): DripStatus {
  const now = input.now ?? new Date()
  if (!input.dripDays || input.dripDays <= 0) {
    return { unlocked: true, unlocksAt: null, daysRemaining: 0 }
  }
  const unlocksAt = new Date(
    input.enrolledAt.getTime() + input.dripDays * 24 * 60 * 60 * 1000,
  )
  if (now >= unlocksAt) {
    return { unlocked: true, unlocksAt, daysRemaining: 0 }
  }
  const msRemaining = unlocksAt.getTime() - now.getTime()
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000))
  return { unlocked: false, unlocksAt, daysRemaining }
}
