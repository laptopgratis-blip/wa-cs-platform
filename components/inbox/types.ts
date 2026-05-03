// Tipe-tipe yang dipakai bersama oleh komponen Inbox.
import type { MessageRole, MessageStatus, PipelineStage } from '@prisma/client'

export type InboxFilter = 'all' | 'ai' | 'attention' | 'resolved'

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
  lastMessage: { content: string; role: MessageRole; createdAt: string } | null
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
  createdAt: string
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
