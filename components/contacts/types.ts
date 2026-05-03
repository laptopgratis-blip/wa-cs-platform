// Tipe untuk halaman Contacts.
import type { PipelineStage } from '@prisma/client'

export interface ContactRow {
  id: string
  phoneNumber: string
  name: string | null
  avatar: string | null
  tags: string[]
  pipelineStage: PipelineStage
  isBlacklisted: boolean
  aiPaused: boolean
  isResolved: boolean
  lastMessageAt: string | null
  createdAt: string
}

export interface ContactDetail extends ContactRow {
  notes: string | null
  waSession: { id: string; displayName: string | null; status: string } | null
  messages: { id: string; content: string; role: string; createdAt: string }[]
}
