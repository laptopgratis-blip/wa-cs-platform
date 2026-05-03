// Token checker — wrapper di atas internal-api dengan logika:
// - hasEnough: cek saldo cukup sebelum reply
// - charge: potong saldo (atomic di server). Kalau gagal (saldo < amount),
//   return ok:false → caller harus pause session.

import { internalApi } from './internal-api.js'

export interface ChargeResult {
  ok: boolean
  balance: number
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

  async charge(input: {
    userId: string
    amount: number
    description?: string
    reference?: string
  }): Promise<ChargeResult> {
    if (input.amount <= 0) {
      return { ok: true, balance: 0 }
    }
    const res = await internalApi.useTokens(input)
    if (res.success && res.data) {
      return { ok: true, balance: res.data.balance }
    }
    // 402 dari server → saldo kurang.
    const insufficient = (res.error || '').toLowerCase().includes('token tidak cukup')
    return {
      ok: false,
      balance: 0,
      insufficient,
      error: res.error,
    }
  },
}
