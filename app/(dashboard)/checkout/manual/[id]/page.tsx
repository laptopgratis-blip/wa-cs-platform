// /checkout/manual/[id] — halaman checkout transfer manual.
// Tampil instruksi transfer (bank, nominal+kode unik, countdown) +
// form upload bukti.
import { ArrowLeft } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { ManualCheckoutDetail } from '@/components/dashboard/ManualCheckoutDetail'
import { PostPublishReturnBanner } from '@/components/onboarding/PostPublishReturnBanner'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { unitLabelForPurpose } from '@/lib/billing/apply-payment-credit'

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
  // Halaman ini khusus paket token / kredit pesan. LP upgrade pakai /checkout/manual-lp/[id].
  if (
    (payment.purpose !== 'TOKEN_PURCHASE' &&
      payment.purpose !== 'MESSAGE_CREDIT_PURCHASE') ||
    !payment.package
  ) {
    notFound()
  }

  const expiresAt = new Date(payment.createdAt.getTime() + TRANSFER_TTL_MS)

  return (
    <PageContainer width="narrow">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link href="/billing">
            <ArrowLeft className="mr-2 size-4" />
            Kembali ke Billing
          </Link>
        </Button>
        <PageHeader
          title="Transfer Manual"
          description="Transfer ke salah satu rekening di bawah, lalu upload bukti transfer untuk diverifikasi."
        />
      </div>

      <PostPublishReturnBanner
        paymentStatus={
          payment.status === 'CONFIRMED'
            ? 'COMPLETED'
            : payment.status === 'PENDING' && payment.proofUrl
              ? 'AWAITING_REVIEW'
              : payment.status === 'PENDING'
                ? 'PENDING'
                : null
        }
      />

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
          unitLabel: unitLabelForPurpose(payment.purpose),
        }}
        banks={banks.map((b) => ({
          id: b.id,
          bankName: b.bankName,
          accountNumber: b.accountNumber,
          accountName: b.accountName,
        }))}
        user={{
          name: session.user.name ?? null,
          email: session.user.email ?? '',
        }}
      />
    </PageContainer>
  )
}
