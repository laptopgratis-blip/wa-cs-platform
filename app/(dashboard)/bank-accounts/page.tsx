// Halaman manajemen rekening bank user + setup WA Konfirmasi.
// Phase 1 (2026-05-07) — full functional. Akses dijaga di server side.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { BankAccountsClient } from '@/components/bank-accounts/BankAccountsClient'
import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import {
  BANK_ACCOUNT_LIMIT_PER_USER,
  DEFAULT_WA_CONFIRM_TEMPLATE,
} from '@/lib/validations/bank-account'

export const metadata = {
  title: 'Rekening Bank · Hulao',
}

export default async function BankAccountsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) {
    return (
      <UpgradeRequired
        currentTier={access.currentTier}
        feature="Rekening Bank"
      />
    )
  }

  // Fetch initial data — auto-create UserShippingProfile kalau belum ada
  // supaya client tinggal edit form.
  const [accounts, profile] = await Promise.all([
    prisma.userBankAccount.findMany({
      where: { userId: session.user.id },
      orderBy: [
        { isDefault: 'desc' },
        { order: 'asc' },
        { createdAt: 'asc' },
      ],
    }),
    (async () => {
      const existing = await prisma.userShippingProfile.findUnique({
        where: { userId: session.user.id },
      })
      if (existing) return existing
      return prisma.userShippingProfile.create({
        data: { userId: session.user.id },
      })
    })(),
  ])

  return (
    <BankAccountsClient
      initialAccounts={accounts.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      }))}
      initialProfile={{
        waConfirmNumber: profile.waConfirmNumber,
        waConfirmTemplate: profile.waConfirmTemplate,
        waConfirmActive: profile.waConfirmActive,
        originCityId: profile.originCityId,
        originCityName: profile.originCityName,
        originProvinceName: profile.originProvinceName,
        enabledCouriers: profile.enabledCouriers,
        defaultWeightGrams: profile.defaultWeightGrams,
      }}
      limit={BANK_ACCOUNT_LIMIT_PER_USER}
      defaultTemplate={DEFAULT_WA_CONFIRM_TEMPLATE}
    />
  )
}
