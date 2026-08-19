// Select bersama untuk daftar broadcast (API GET + halaman server) supaya
// bentuk BroadcastListItem konsisten.
import type { Prisma } from '@prisma/client'

export const BROADCAST_LIST_SELECT = {
  id: true,
  name: true,
  message: true,
  targetTags: true,
  targetStages: true,
  status: true,
  scheduledAt: true,
  startedAt: true,
  completedAt: true,
  totalTargets: true,
  totalSent: true,
  totalFailed: true,
  createdAt: true,
  provider: true,
  category: true,
  estimatedCreditRp: true,
  chargedCreditRp: true,
  totalDelivered: true,
  totalRead: true,
  totalSkipped: true,
  pausedReason: true,
  template: { select: { id: true, name: true, category: true, status: true } },
  waSession: { select: { id: true, displayName: true, phoneNumber: true, provider: true } },
} satisfies Prisma.BroadcastSelect

export type BroadcastListRow = Prisma.BroadcastGetPayload<{ select: typeof BROADCAST_LIST_SELECT }>

export function serializeBroadcastRow(b: BroadcastListRow) {
  return {
    ...b,
    scheduledAt: b.scheduledAt?.toISOString() ?? null,
    startedAt: b.startedAt?.toISOString() ?? null,
    completedAt: b.completedAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
  }
}
