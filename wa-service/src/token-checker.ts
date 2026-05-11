// Token checker — wrapper di atas internal-api dengan logika:
// - hasEnough: cek saldo cukup sebelum reply (pre-flight, rough estimate)
// - chargeCsReply: potong saldo proporsional dari real input/output token AI.
//   Server hitung dari (inputTokens, outputTokens) × harga AiModel ×
//   margin AiFeatureConfig['CS_REPLY']. Kalau gagal (saldo kurang), return
//   ok:false → caller pause session.

import { internalApi } from './internal-api.js'

export interface ChargeResult {
  ok: boolean
  balance: number
  /** Token platform yang benar-benar dipotong (server-computed). */
  tokensCharged?: number
  /** Cost API provider yang dibayar platform (Rp) — untuk audit dashboard. */
  apiCostRp?: number
  revenueRp?: number
  profitRp?: number
  marginPct?: number
  /** True kalau gagal karena saldo kurang (bukan error infrastruktur). */
  insufficient?: boolean
  error?: string
}

export const tokenChecker = {
  async hasEnough(userId: string, amount: number): Promise<boolean> {
    if (amount <= 0) return true
    const res = await internalApi.checkTokens(userId)
    if (!res.success || !res.data) return false
    return res.data.balance >= amount
  },

  async chargeCsReply(input: {
    userId: string
    sessionId: string
    aiModelId: string
    inputTokens: number
    outputTokens: number
  }): Promise<ChargeResult> {
    const res = await internalApi.chargeCsReply(input)
    if (res.success && res.data) {
      return {
        ok: true,
        balance: res.data.balance,
        tokensCharged: res.data.tokensCharged,
        apiCostRp: res.data.apiCostRp,
        revenueRp: res.data.revenueRp,
        profitRp: res.data.profitRp,
        marginPct: res.data.marginPct,
      }
    }
    const insufficient = (res.error || '').toLowerCase().includes('token tidak cukup')
    return {
      ok: false,
      balance: 0,
      insufficient,
      error: res.error,
    }
  },
}
