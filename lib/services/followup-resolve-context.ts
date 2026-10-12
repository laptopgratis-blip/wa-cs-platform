// Data milik seller yang dibutuhkan resolver variabel follow-up
// ({rekening}, {wa_admin}) — dimuat lewat satu pintu supaya engine (saat
// antrean dibuat), sender (param template Meta) dan refresh antrean (saat data
// pelanggan diedit) me-resolve template dengan konteks yang SAMA.

import type { UserBankAccount, UserShippingProfile } from '@prisma/client'

import { prisma } from '@/lib/prisma'

export interface SellerResolveExtras {
  bankAccounts: UserBankAccount[]
  shippingProfile: UserShippingProfile | null
}

export async function loadSellerResolveExtras(
  userId: string,
): Promise<SellerResolveExtras> {
  const [bankAccounts, shippingProfile] = await Promise.all([
    prisma.userBankAccount.findMany({ where: { userId, isActive: true } }),
    prisma.userShippingProfile.findUnique({ where: { userId } }),
  ])
  return { bankAccounts, shippingProfile }
}
