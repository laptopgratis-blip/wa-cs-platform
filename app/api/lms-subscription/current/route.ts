// GET /api/lms-subscription/current — info subscription LMS aktif user
// + LmsQuota current. Dipakai di UI /pricing-lms untuk badge "plan kamu"
// dan di header builder course untuk display tier.
import type { NextResponse } from 'next/server'

import { jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { getActiveLmsQuota } from '@/lib/services/lms/quota'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const [quota, subscription] = await Promise.all([
    getActiveLmsQuota(session.user.id),
    prisma.lmsSubscription.findFirst({
      where: { userId: session.user.id, status: 'ACTIVE' },
      orderBy: { endDate: 'desc' },
      include: {
        lmsPackage: { select: { id: true, name: true, tier: true } },
      },
    }),
  ])
  return jsonOk({
    quota,
    subscription: subscription
      ? {
          id: subscription.id,
          startDate: subscription.startDate.toISOString(),
          endDate: subscription.endDate.toISOString(),
          status: subscription.status,
          packageId: subscription.lmsPackage.id,
          packageName: subscription.lmsPackage.name,
          tier: subscription.lmsPackage.tier,
        }
      : null,
  })
}
