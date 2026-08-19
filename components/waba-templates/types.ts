// Tipe bersama UI Template Meta (Trek 2B). Bentuk = row WabaTemplate yang
// diserialisasi JSON (Date → string).
import type { StatusTone } from '@/components/shared/StatusBadge'
import type { WabaTemplateButton } from '@/lib/services/waba/types'

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
export type TemplateStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED'
  | 'IN_APPEAL'
  | 'LIMIT_EXCEEDED'
  | 'DELETED'
export type TemplateHeaderType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'

export interface WabaTemplateDto {
  id: string
  userId: string
  wabaId: string
  name: string
  language: string
  category: TemplateCategory
  status: TemplateStatus
  metaTemplateId: string | null
  purposeKey: string | null
  headerType: string | null
  headerText: string | null
  headerTextExample: string | null
  headerMediaHandle: string | null
  headerMediaUrl: string | null
  bodyText: string
  bodyExamples: string[]
  footerText: string | null
  buttons: WabaTemplateButton[] | null
  authAddSecurityRecommendation: boolean
  authCodeExpirationMinutes: number | null
  rejectionReason: string | null
  qualityScore: string | null
  submittedAt: string | null
  approvedAt: string | null
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CloudSessionOption {
  id: string
  displayName: string | null
  phoneNumber: string | null
  wabaId: string | null
  status: string
}

export interface TemplateSendParamsDto {
  header?: { type: 'text' | 'image' | 'video' | 'document'; value: string; filename?: string }
  body: string[]
  buttons?: { index: number; subType: 'url' | 'copy_code' | 'quick_reply'; value: string }[]
}

export const STATUS_LABEL: Record<TemplateStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Menunggu review Meta',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  PAUSED: 'Dijeda Meta',
  DISABLED: 'Dinonaktifkan',
  IN_APPEAL: 'Banding',
  LIMIT_EXCEEDED: 'Limit terlampaui',
  DELETED: 'Dihapus',
}

export const STATUS_TONE: Record<TemplateStatus, StatusTone> = {
  DRAFT: 'neutral',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  PAUSED: 'danger',
  DISABLED: 'danger',
  IN_APPEAL: 'warning',
  LIMIT_EXCEEDED: 'danger',
  DELETED: 'neutral',
}

export const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  UTILITY: 'Utility',
  MARKETING: 'Marketing',
  AUTHENTICATION: 'Authentication (OTP)',
}

export const CATEGORY_HINT: Record<TemplateCategory, string> = {
  UTILITY: 'Transaksional: konfirmasi order, resi, pengingat bayar, info akun. Gratis dalam window 24 jam.',
  MARKETING: 'Promo & penawaran. Selalu berbayar; customer bisa berhenti (opt-out). Sertakan "Balas STOP".',
  AUTHENTICATION: 'Kode OTP. Body & footer dibuat Meta otomatis; wajib tombol salin kode.',
}

export const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'id', label: 'Indonesia (id)' },
  { value: 'en', label: 'English (en)' },
  { value: 'en_US', label: 'English US (en_US)' },
  { value: 'ms', label: 'Melayu (ms)' },
]

export function sessionLabel(s: CloudSessionOption): string {
  return s.displayName ? `${s.displayName} · ${s.phoneNumber ?? ''}` : s.phoneNumber ?? s.id
}
