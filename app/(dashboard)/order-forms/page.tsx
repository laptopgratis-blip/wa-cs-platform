import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { OrderFormsClient } from '@/components/order-forms/OrderFormsClient'
import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { ORDER_FORM_LIMIT_PER_USER } from '@/lib/validations/order-form'

export const metadata = {
  title: 'Form Order · Hulao',
}

export default async function OrderFormsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) {
    return (
      <UpgradeRequired currentTier={access.currentTier} feature="Form Order" />
    )
  }

  const [forms, products, pixels] = await Promise.all([
    prisma.orderForm.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.findMany({
      where: { userId: session.user.id, isActive: true },
      select: { id: true, name: true, price: true, imageUrl: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.pixelIntegration.findMany({
      where: { userId: session.user.id, isActive: true },
      select: {
        id: true,
        platform: true,
        displayName: true,
        serverSideEnabled: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return (
    <OrderFormsClient
      initialForms={forms.map((f) => ({
        ...f,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      }))}
      products={products}
      pixels={pixels}
      limit={ORDER_FORM_LIMIT_PER_USER}
    />
  )
}
