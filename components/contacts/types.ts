// Tipe untuk halaman Contacts.
import type { PipelineStage, WaProvider, WaStatus } from '@prisma/client'

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

/** Nomor WA tujuan impor kontak (sesi aktif milik user). */
export interface ImportSessionOption {
  id: string
  displayName: string | null
  phoneNumber: string | null
  provider: WaProvider
  status: WaStatus
}

/** Respons pratinjau (dryRun) POST /api/contacts/import. */
export interface ImportPreview {
  totalRows: number
  validCount: number
  invalidCount: number
  duplicatesInFile: number
  truncated: boolean
  maxRows: number
  tag: string
  existingInSession: number
  hasHeader: boolean
  invalidSample: { line: number; raw: string; reason: string }[]
  /** Nomor sudah disamarkan server. */
  validSample: { phone: string; name: string | null }[]
}

/** Respons impor sungguhan POST /api/contacts/import. */
export interface ImportResult {
  created: number
  updatedExisting: number
  alreadyTagged: number
  invalidCount: number
  truncated: boolean
  tag: string
}
