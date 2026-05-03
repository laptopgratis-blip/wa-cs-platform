// /checkout/manual/[id] — halaman checkout transfer manual.
// Tampil instruksi transfer (bank, nominal+kode unik, countdown) +
// form upload bukti.
import { ArrowLeft } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { ManualCheckoutDetail } from '@/components/dashboard/ManualCheckoutDetail'
import { Button } from '@/components/ui/button'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const TRANSFER_TTL_MS = 24 * 60 * 60 * 1000 // 24 jam

export default async function ManualCheckoutPage({
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
      include: { package: true },
    }),
    prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  if (!payment) notFound()
  if (payment.userId !== session.user.id) notFound()

  const expiresAt = new Date(payment.createdAt.getTime() + TRANSFER_TTL_MS)

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link href="/billing">
            <ArrowLeft className="mr-2 size-4" />
            Kembali ke Billing
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Transfer Manual
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Transfer ke salah satu rekening di bawah, lalu upload bukti transfer untuk
          diverifikasi.
        </p>
      </div>

      <ManualCheckoutDetail
        payment={{
          id: payment.id,
          amount: payment.amount,
          tokenAmount: payment.tokenAmount,
          uniqueCode: payment.uniqueCode,
          totalAmount: payment.totalAmount,
          status: payment.status,
          proofUrl: payment.proofUrl,
          proofNote: payment.proofNote,
          rejectionReason: payment.rejectionReason,
          packageName: payment.package.name,
          createdAt: payment.createdAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        }}
        banks={banks.map((b) => ({
          id: b.id,
          bankName: b.bankName,
          accountNumber: b.accountNumber,
          accountName: b.accountName,
        }))}
      />
    </div>
  )
}
