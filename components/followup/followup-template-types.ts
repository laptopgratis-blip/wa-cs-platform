// Tipe & konstanta bersama UI Template Follow-Up (TemplatesClient,
// TemplateModal, MetaTemplateLinkSection). Bentuk = respons
// GET /api/followup/templates.

export const TRIGGERS = [
  { value: 'ORDER_CREATED', label: 'Saat Order Masuk' },
  { value: 'PAYMENT_PAID', label: 'Saat Pembayaran Diterima' },
  { value: 'SHIPPED', label: 'Saat Order Dikirim' },
  { value: 'COMPLETED', label: 'Saat Order Selesai' },
  { value: 'CANCELLED', label: 'Saat Order Dibatalkan' },
  { value: 'DAYS_AFTER_ORDER', label: 'N Hari Setelah Order' },
  { value: 'DAYS_AFTER_PAID', label: 'N Hari Setelah Pembayaran' },
  { value: 'DAYS_AFTER_SHIPPED', label: 'N Hari Setelah Dikirim' },
  {
    value: 'DAYS_AFTER_DELIVERED',
    label: 'N Hari Setelah Diterima (testimoni)',
  },
  {
    value: 'DAYS_AFTER_LIVE_LEAD',
    label: 'N Hari Setelah Lead Live (belum order)',
  },
] as const

export const PAYMENT_STATUSES = [
  'PENDING',
  'WAITING_CONFIRMATION',
  'PAID',
  'CANCELLED',
]
export const DELIVERY_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
]

export const NULL_VALUE = '__NULL__'

/** Ringkasan template Meta tertaut (GET /api/followup/templates). */
export interface LinkedMetaTemplate {
  id: string
  name: string
  language: string
  status: string
  wabaId: string
  category: string
}

export interface FollowUpTemplateDto {
  id: string
  name: string
  trigger: string
  paymentMethod: string | null
  // null = semua order; PHYSICAL = non-digital; DIGITAL = digital-only.
  orderType: string | null
  applyOnPaymentStatus: string | null
  applyOnDeliveryStatus: string | null
  delayDays: number
  message: string
  isActive: boolean
  isDefault: boolean
  scope: string
  orderFormId: string | null
  order: number
  metaTemplateId: string | null
  metaParamMap: unknown
  metaTemplate: LinkedMetaTemplate | null
  /** Tautan basi terhadap WABA aktif — seller perlu pilih ulang. */
  metaIssue: 'WABA_INACTIVE' | 'TEMPLATE_UNUSABLE' | null
}

export interface FormItem {
  id: string
  name: string
}

/** Peta {{n}} tersimpan sebagai Json — ambil array string dengan aman. */
export function readParamMap(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.map((v) => (typeof v === 'string' ? v : ''))
    : []
}
