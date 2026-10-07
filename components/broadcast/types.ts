// Tipe shared untuk komponen broadcast.
import type {
  BroadcastStatus,
  PipelineStage,
  WaProvider,
  WaStatus,
} from '@prisma/client'

export type BroadcastCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'

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
  // Cloud API (Trek 2B)
  provider: WaProvider
  category: BroadcastCategory | null
  estimatedCreditRp: number
  chargedCreditRp: number
  totalDelivered: number
  totalRead: number
  totalSkipped: number
  pausedReason: string | null
  template: { id: string; name: string; category: BroadcastCategory; status: string } | null
  waSession: {
    id: string
    displayName: string | null
    phoneNumber: string | null
    provider?: WaProvider
  } | null
}

// Superset dari ImportSessionOption (components/contacts/types) — dipakai apa
// adanya oleh ImportContactsDialog yang dibuka dari form broadcast.
export interface SessionOption {
  id: string
  displayName: string | null
  phoneNumber: string | null
  status: WaStatus
  provider: WaProvider
  wabaId: string | null
}
