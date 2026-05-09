// /checkout/manual-lp/[id] — halaman checkout transfer manual untuk
// upgrade Landing Page. Memvalidasi purpose=LP_UPGRADE.
import { ArrowLeft } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { LpManualCheckoutDetail } from '@/components/dashboard/LpManualCheckoutDetail'
import { Button } from '@/components/ui/button'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const TRANSFER_TTL_MS = 24 * 60 * 60 * 1000

export default async function ManualLpCheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [payment, banks] = await Promise.all([
    prisma.manualPayment.findUnique({
      where: { id },
      include: { lpPackage: true },
    }),
    prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  if (!payment) notFound()
  if (payment.userId !== session.user.id) notFound()
  if (payment.purpose !== 'LP_UPGRADE' || !payment.lpPackage) notFound()

  const expiresAt = new Date(payment.createdAt.getTime() + TRANSFER_TTL_MS)

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link href="/pricing">
            <ArrowLeft className="mr-2 size-4" />
            Kembali ke Pilih Paket
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Transfer Manual — Upgrade LP
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Transfer ke salah satu rekening di bawah, lalu upload bukti transfer.
          Setelah verifikasi, kuota LP kamu otomatis di-upgrade.
        </p>
      </div>

      <LpManualCheckoutDetail
        payment={{
          id: payment.id,
          amount: payment.amount,
          uniqueCode: payment.uniqueCode,
          totalAmount: payment.totalAmount,
          status: payment.status,
          proofUrl: payment.proofUrl,
          proofNote: payment.proofNote,
          rejectionReason: payment.rejectionReason,
          createdAt: payment.createdAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          package: {
            name: payment.lpPackage.name,
            tier: payment.lpPackage.tier,
            maxLp: payment.lpPackage.maxLp,
            maxStorageMB: payment.lpPackage.maxStorageMB,
          },
        }}
        banks={banks.map((b) => ({
          id: b.id,
          bankName: b.bankName,
          accountNumber: b.accountNumber,
          accountName: b.accountName,
        }))}
        user={{ name: session.user.name ?? null, email: session.user.email ?? '' }}
      />
    </div>
  )
}
