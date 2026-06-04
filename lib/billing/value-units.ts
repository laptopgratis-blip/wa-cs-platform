// Helper untuk pricing card di /billing — terjemahkan tokenAmount jadi
// unit yang awam paham ("Cukup buat 2 bulan LP Power", dst).
//
// Cara hitung:
//   • Bulanan LP plan  = floor(tokens / (priceMonthly / pricePerToken))
//   • Batch konten     = floor(tokens / TOKENS_PER_CONTENT_BATCH)
//   • Reply CS AI      = floor(tokens / TOKENS_PER_CS_REPLY)
//
// Angka konsumsi per fitur di bawah = estimasi konservatif berdasarkan
// observasi production. Update kalau Phase tarif baru ubah konsumsi.

// 1 batch = 15 status WA, avg 800 token per status (dari content-studio gen).
const TOKENS_PER_CONTENT_BATCH = 12_000

// CS AI reply rata-rata pakai 15 token user (executeAiWithCharge default).
const TOKENS_PER_CS_REPLY = 15

export interface ValueUnit {
  label: string
  value: string
}

export interface LpPlan {
  name: string
  priceMonthly: number
  canUseOrderSystem: boolean
}

interface ComputeArgs {
  tokenAmount: number
  pricePerToken: number
  lpPlans: LpPlan[]
}

// Pilih 1 plan LP yang paling representatif untuk paket ini:
//   • Saldo Besar → cukup berlangganan plan TERMAHAL (Power)
//   • Saldo Sedang → Popular
//   • Saldo Mini → Starter
// Logic: cari plan termahal yang user masih sanggup ≥ 1 bulan, kalau tidak
// ada plan yang affordable, jatuh ke plan termurah.
function pickHighlightPlan(
  tokenAmount: number,
  pricePerToken: number,
  plans: LpPlan[],
): { plan: LpPlan; months: number } | null {
  if (plans.length === 0) return null
  const sorted = [...plans].sort((a, b) => b.priceMonthly - a.priceMonthly)
  for (const plan of sorted) {
    const tokenPerMonth = Math.ceil(plan.priceMonthly / pricePerToken)
    const months = Math.floor(tokenAmount / tokenPerMonth)
    if (months >= 1) return { plan, months }
  }
  const cheapest = sorted[sorted.length - 1]
  const tokenPerMonth = Math.ceil(cheapest.priceMonthly / pricePerToken)
  const months = tokenAmount / tokenPerMonth
  return { plan: cheapest, months: Math.max(0, Math.round(months * 10) / 10) }
}

export function computeValueUnits({
  tokenAmount,
  pricePerToken,
  lpPlans,
}: ComputeArgs): ValueUnit[] {
  const units: ValueUnit[] = []

  const highlight = pickHighlightPlan(tokenAmount, pricePerToken, lpPlans)
  if (highlight) {
    const { plan, months } = highlight
    if (months >= 1) {
      units.push({
        label: `LP ${plan.name}`,
        value: `${months} bulan`,
      })
      if (plan.canUseOrderSystem) {
        units.push({
          label: 'Order System aktif',
          value: `${months} bulan`,
        })
      }
    } else if (months > 0) {
      // Cuma cukup sebagian bulan — tampilkan dalam %.
      units.push({
        label: `LP ${plan.name}`,
        value: `${Math.round(months * 100)}% bulan`,
      })
    }
  }

  const contentBatches = Math.floor(tokenAmount / TOKENS_PER_CONTENT_BATCH)
  if (contentBatches >= 1) {
    units.push({
      label: 'Batch konten (15 status WA)',
      value: `${contentBatches}×`,
    })
  }

  const csReplies = Math.floor(tokenAmount / TOKENS_PER_CS_REPLY)
  if (csReplies >= 100) {
    // Tampilkan dalam rb supaya lebih readable.
    const inK = Math.floor(csReplies / 100) / 10 // 1 decimal
    units.push({
      label: 'Reply CS AI',
      value: csReplies >= 1000 ? `${inK.toFixed(1)}rb` : `${csReplies}`,
    })
  }

  return units
}
