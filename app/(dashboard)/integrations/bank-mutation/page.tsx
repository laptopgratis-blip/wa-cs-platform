import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { BankMutationClient } from '@/components/bank-mutation/BankMutationClient'
import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

export const metadata = {
  title: 'Auto Confirm Pembayaran (BETA) · Hulao',
}

// Server component — handle auth + plan gate, lalu render client component.
// Integration bisa null (user belum setup) — client tampilkan disclaimer +
// form setup.
export default async function BankMutationPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) {
    return (
      <UpgradeRequired
        currentTier={access.currentTier}
        feature="Auto Confirm Pembayaran (BETA)"
      />
    )
  }

  const integration = await prisma.bankMutationIntegration.findUnique({
    where: { userId: session.user.id },
  })

  return (
    <BankMutationClient
      initial={
        integration
          ? {
              id: integration.id,
              bankCode: integration.bankCode,
              accountNumber: integration.accountNumber,
              accountName: integration.accountName,
              accountBalance: integration.accountBalance,
              isActive: integration.isActive,
              isBetaConsented: integration.isBetaConsented,
              isAdminBlocked: integration.isAdminBlocked,
              autoConfirmEnabled: integration.autoConfirmEnabled,
              matchByExactAmount: integration.matchByExactAmount,
              matchByCustomerName: integration.matchByCustomerName,
              scrapeIntervalMinutes: integration.scrapeIntervalMinutes,
              lastScrapedAt: integration.lastScrapedAt?.toISOString() ?? null,
              lastScrapeStatus: integration.lastScrapeStatus,
              lastScrapeError: integration.lastScrapeError,
              totalMutationsCaptured: integration.totalMutationsCaptured,
              totalAutoConfirmed: integration.totalAutoConfirmed,
              totalScrapes: integration.totalScrapes,
              totalScrapeFailures: integration.totalScrapeFailures,
              hasCredentials: !!integration.bcaUserId && !!integration.bcaPin,
            }
          : null
      }
    />
  )
}
