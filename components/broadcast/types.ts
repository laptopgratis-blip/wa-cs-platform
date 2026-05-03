// Tipe shared untuk komponen broadcast.
import type { BroadcastStatus, PipelineStage } from '@prisma/client'

export interface BroadcastListItem {
  id: string
  name: string
  message: string
  targetTags: string[]
  targetStages: PipelineStage[]
  status: BroadcastStatus
  scheduledAt: string | null
  startedAt: string | null
  completedAt: string | null
  totalTargets: number
  totalSent: number
  totalFailed: number
  createdAt: string
  waSession: { id: string; displayName: string | null; phoneNumber: string | null } | null
}

export interface SessionOption {
  id: string
  displayName: string | null
  phoneNumber: string | null
  status: string
}
