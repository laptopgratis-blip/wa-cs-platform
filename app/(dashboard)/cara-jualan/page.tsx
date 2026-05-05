// Halaman /cara-jualan — atur alur otomatis terima pesanan (COD, Transfer, dll).
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import {
  SalesFlowList,
  type SalesFlowListItem,
} from '@/components/sales-flow/SalesFlowList'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  type SalesFlowFinalActionInput,
  type SalesFlowStepInput,
  SALES_FLOW_LIMIT_PER_USER,
} from '@/lib/validations/sales-flow'

export const dynamic = 'force-dynamic'

export default async function CaraJualanPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const rows = await prisma.userSalesFlow.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      name: true,
      template: true,
      description: true,
      triggerKeywords: true,
      steps: true,
      finalAction: true,
      isActive: true,
    },
  })

  const flows: SalesFlowListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    template: r.template,
    description: r.description,
    triggerKeywords: r.triggerKeywords,
    steps: (r.steps as unknown as SalesFlowStepInput[]) ?? [],
    finalAction:
      (r.finalAction as unknown as SalesFlowFinalActionInput) ?? {
        notifyAdmin: false,
        adminPhone: '',
        replyMessage: 'Terima kasih ya kak!',
      },
    isActive: r.isActive,
  }))

  const activeCount = flows.filter((f) => f.isActive).length

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <SalesFlowList
        flows={flows}
        activeCount={activeCount}
        limit={SALES_FLOW_LIMIT_PER_USER}
      />
    </div>
  )
}
