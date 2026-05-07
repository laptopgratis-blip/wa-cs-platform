// Tipe-tipe yang dipakai bersama oleh komponen Inbox.
import type { MessageRole, MessageStatus, PipelineStage } from '@prisma/client'

export type InboxFilter = 'all' | 'ai' | 'attention' | 'resolved'

// Asal pesan AGENT/AI: WA_DIRECT (CS balas langsung dari WA HP), WEB_DASHBOARD
// (CS balas dari inbox web), AI (otomatis). null = legacy/customer.
export type MessageSource = 'WA_DIRECT' | 'WEB_DASHBOARD' | 'AI'

export interface InboxConversation {
  id: string
  phoneNumber: string
  name: string | null
  avatar: string | null
  tags: string[]
  pipelineStage: PipelineStage
  aiPaused: boolean
  isResolved: boolean
  lastMessageAt: string | null
  waSession: { id: string; displayName: string | null; phoneNumber: string | null } | null
  lastMessage: {
    content: string
    role: MessageRole
    source: MessageSource | null
    createdAt: string
  } | null
}

export interface InboxCounts {
  all: number
  ai: number
  attention: number
  resolved: number
}

export interface ChatMessage {
  id: string
  content: string
  role: MessageRole
  status: MessageStatus
  // Asal pesan untuk role AGENT/AI. Null untuk customer / pesan lama.
  source: MessageSource | null
  createdAt: string
  // Profitability fields — null untuk pesan customer / pre-feature, dan
  // hanya di-populate kalau session.role === 'ADMIN'.
  apiInputTokens?: number | null
  apiOutputTokens?: number | null
  apiCostRp?: number | null
  tokensCharged?: number | null
  revenueRp?: number | null
  profitRp?: number | null
  modelName?: string | null
}

export interface ChatContact {
  id: string
  phoneNumber: string
  name: string | null
  avatar: string | null
  tags: string[]
  notes: string | null
  pipelineStage: PipelineStage
  aiPaused: boolean
  isResolved: boolean
  waSession: { id: string; displayName: string | null; status: string } | null
}
