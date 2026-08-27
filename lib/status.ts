// Sumber kebenaran tunggal: label (Bahasa Indonesia) + tone untuk tiap status
// enum per-domain. Dipakai bersama <StatusBadge> (components/shared/StatusBadge).
// Ganti map warna/label ad-hoc yang tersebar di banyak komponen.
import type { StatusTone } from '@/components/shared/StatusBadge'

export interface StatusMeta {
  label: string
  tone: StatusTone
}

// Status pembayaran order — lihat components/orders/OrdersTable.tsx (PaymentBadge).
export const paymentStatusMeta: Record<string, StatusMeta> = {
  PENDING: { label: 'Belum bayar', tone: 'warning' },
  WAITING_CONFIRMATION: { label: 'Cek bukti', tone: 'info' },
  PAID: { label: 'Lunas', tone: 'success' },
  CANCELLED: { label: 'Batal', tone: 'neutral' },
}

// Status pengiriman order — lihat components/orders/OrdersTable.tsx (DeliveryBadge).
export const deliveryStatusMeta: Record<string, StatusMeta> = {
  PROCESSING: { label: 'Proses', tone: 'info' },
  SHIPPED: { label: 'Dikirim', tone: 'info' },
  DELIVERED: { label: 'Selesai', tone: 'success' },
}

// Pembayaran manual (verifikasi admin) — lihat components/admin/FinanceManager.tsx.
export const manualPaymentMeta: Record<string, StatusMeta> = {
  PENDING: { label: 'Menunggu', tone: 'warning' },
  CONFIRMED: { label: 'Dikonfirmasi', tone: 'success' },
  REJECTED: { label: 'Ditolak', tone: 'danger' },
}

// Enrollment LMS — lihat components/admin/LmsEnrollmentsManager.tsx.
export const enrollmentMeta: Record<string, StatusMeta> = {
  ACTIVE: { label: 'Aktif', tone: 'success' },
  REVOKED: { label: 'Dicabut', tone: 'danger' },
}

// Status course LMS — lihat components/lms/CoursesList.tsx & CourseBuilder.tsx.
export const courseStatusMeta: Record<string, StatusMeta> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PUBLISHED: { label: 'Tayang', tone: 'success' },
  ARCHIVED: { label: 'Arsip', tone: 'danger' },
}

// Status content piece (Content Studio) — lihat components/content/LibraryTab.tsx
// dan components/content/PieceDetailClient.tsx.
export const contentPieceStatusMeta: Record<string, StatusMeta> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  READY: { label: 'Siap', tone: 'info' },
  POSTED: { label: 'Tayang', tone: 'success' },
  ARCHIVED: { label: 'Arsip', tone: 'neutral' },
}

// Tahap funnel konten (TOFU/MOFU/BOFU) — lihat components/content/LibraryTab.tsx
// dan components/content/PieceDetailClient.tsx.
export const funnelStageMeta: Record<string, StatusMeta> = {
  TOFU: { label: 'Awareness', tone: 'info' },
  MOFU: { label: 'Pertimbangan', tone: 'warning' },
  BOFU: { label: 'Beli', tone: 'success' },
}

// Host template CS Live AI — lihat components/admin/HostTemplatesManager.tsx.
export const hostTemplateStatusMeta: Record<string, StatusMeta> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  GENERATING_IMAGE: { label: 'Generate gambar…', tone: 'warning' },
  IMAGE_READY: { label: 'Gambar siap', tone: 'info' },
  GENERATING_VIDEO: { label: 'Generate video…', tone: 'warning' },
  READY: { label: 'Siap pakai', tone: 'success' },
  FAILED: { label: 'Gagal', tone: 'danger' },
  REJECTED: { label: 'Ditolak', tone: 'danger' },
}

// Pipeline stage CRM — lihat components/contacts/PipelineBadge.tsx.
// Label sinkron dengan PIPELINE_LABELS di lib/validations/contact.ts.
export const pipelineStageMeta: Record<string, StatusMeta> = {
  NEW: { label: 'Baru', tone: 'info' },
  PROSPECT: { label: 'Prospek', tone: 'info' },
  INTEREST: { label: 'Tertarik', tone: 'brand' },
  NEGOTIATION: { label: 'Negosiasi', tone: 'warning' },
  CLOSED_WON: { label: 'Closed Won', tone: 'success' },
  CLOSED_LOST: { label: 'Closed Lost', tone: 'danger' },
}

// Scene host template (video Kling per host) — lihat components/admin/HostSceneBoard.tsx.
export const hostSceneStatusMeta: Record<string, StatusMeta> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  GENERATING: { label: 'Generate…', tone: 'warning' },
  READY: { label: 'Siap', tone: 'success' },
  FAILED: { label: 'Gagal', tone: 'danger' },
}

// Status sesi WhatsApp (WaStatus) — lihat components/dashboard/AnalyticsView.tsx.
export const waSessionStatusMeta: Record<string, StatusMeta> = {
  DISCONNECTED: { label: 'Terputus', tone: 'neutral' },
  CONNECTING: { label: 'Menghubungkan', tone: 'warning' },
  WAITING_QR: { label: 'Menunggu QR', tone: 'info' },
  CONNECTED: { label: 'Aktif', tone: 'success' },
  PAUSED: { label: 'Dijeda', tone: 'warning' },
  ERROR: { label: 'Error', tone: 'danger' },
}

// Status broadcast — lihat components/broadcast/BroadcastCard.tsx.
export const broadcastStatusMeta: Record<string, StatusMeta> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SCHEDULED: { label: 'Terjadwal', tone: 'info' },
  SENDING: { label: 'Mengirim', tone: 'brand' },
  PAUSED: { label: 'Dijeda', tone: 'warning' },
  COMPLETED: { label: 'Selesai', tone: 'success' },
  FAILED: { label: 'Gagal', tone: 'danger' },
  CANCELLED: { label: 'Dibatalkan', tone: 'neutral' },
}

// Status LiveClip (Klip Live) — lihat components/admin/ClipLibraryBoard.tsx.
export const liveClipStatusMeta: Record<string, StatusMeta> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  GENERATING_AUDIO: { label: 'Audio gen…', tone: 'warning' },
  GENERATING_VIDEO: { label: 'Video gen…', tone: 'warning' },
  PROCESSING_EMBEDDING: { label: 'Embed…', tone: 'warning' },
  READY: { label: 'Siap', tone: 'success' },
  FAILED: { label: 'Gagal', tone: 'danger' },
}

// Status lead live room (LiveLead.status) — lihat components/live/LiveLeadsList.tsx.
export const liveLeadStatusMeta: Record<string, StatusMeta> = {
  NEW: { label: 'Baru', tone: 'info' },
  HANDOFF_SENT: { label: 'Handoff WA', tone: 'success' },
  HANDOFF_FAILED: { label: 'Handoff WA gagal', tone: 'danger' },
  CLOSED_WON: { label: 'Closed Won', tone: 'success' },
  CLOSED_LOST: { label: 'Closed Lost', tone: 'neutral' },
}

// Status proposal optimasi AI live room — lihat components/live/ImprovementBoard.tsx.
export const liveProposalStatusMeta: Record<string, StatusMeta> = {
  PENDING: { label: 'Menunggu approve', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  APPLIED: { label: 'Aktif', tone: 'success' },
  REJECTED: { label: 'Ditolak', tone: 'danger' },
  ROLLED_BACK: { label: 'Di-rollback', tone: 'neutral' },
}

// Status kunci API provider — lihat components/admin/ApiKeysManager.tsx.
export const apiKeyStatusMeta: Record<string, StatusMeta> = {
  AKTIF: { label: 'Aktif', tone: 'success' },
  BELUM_DITES: { label: 'Belum dites', tone: 'warning' },
  ERROR: { label: 'Error', tone: 'danger' },
  KOSONG: { label: 'Kosong', tone: 'neutral' },
}

// Freshness harga preset AI — lihat components/admin/AiPricingDatabase.tsx.
export const pricingFreshnessMeta: Record<string, StatusMeta> = {
  verified: { label: 'Verified', tone: 'success' },
  stale: { label: 'Stale', tone: 'warning' },
  outdated: { label: 'Outdated', tone: 'danger' },
}

// Status job riset harga AI — lihat components/admin/AiPricingDatabase.tsx.
export const pricingResearchJobMeta: Record<string, StatusMeta> = {
  SUCCESS: { label: 'SUCCESS', tone: 'success' },
  RUNNING: { label: 'RUNNING', tone: 'warning' },
  FAILED: { label: 'FAILED', tone: 'danger' },
}

// Status margin surface AI (kalkulator harga) — lihat components/admin/PricingCalculator.tsx.
export const pricingMarginMeta: Record<string, StatusMeta> = {
  AMAN: { label: 'AMAN', tone: 'success' },
  TIPIS: { label: 'TIPIS', tone: 'warning' },
  RUGI: { label: 'RUGI', tone: 'danger' },
}

// Status subscription LP — lihat components/admin/AdminSubscriptionsView.tsx
// dan components/subscription/SubscriptionDashboard.tsx (history bisa membawa
// status invoice PAID/WAITING_CONFIRMATION di kolom yang sama).
export const subscriptionStatusMeta: Record<string, StatusMeta> = {
  PENDING: { label: 'Pending', tone: 'warning' },
  ACTIVE: { label: 'Aktif', tone: 'success' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
  CANCELLED: { label: 'Dibatalkan', tone: 'neutral' },
  PAID: { label: 'Lunas', tone: 'success' },
  WAITING_CONFIRMATION: { label: 'Menunggu Konfirmasi', tone: 'info' },
}

// Status invoice subscription — lihat components/admin/AdminSubscriptionsView.tsx.
export const subscriptionInvoiceStatusMeta: Record<string, StatusMeta> = {
  PENDING: { label: 'Belum bayar', tone: 'warning' },
  WAITING_CONFIRMATION: { label: 'Cek bukti', tone: 'info' },
  PAID: { label: 'Lunas', tone: 'success' },
  EXPIRED: { label: 'Kedaluwarsa', tone: 'neutral' },
  CANCELLED: { label: 'Batal', tone: 'neutral' },
}

// Hasil match mutasi bank (matchAction) — lihat components/bank-mutation/MutationsClient.tsx.
export const bankMatchActionMeta: Record<string, StatusMeta> = {
  AUTO_CONFIRMED: { label: 'Auto-confirmed', tone: 'success' },
  MULTIPLE_MATCH: { label: 'Multiple match', tone: 'warning' },
  NO_MATCH: { label: 'No match', tone: 'neutral' },
  IGNORED: { label: 'Ignored', tone: 'neutral' },
  MANUAL_RESOLVED: { label: 'Manual resolved', tone: 'success' },
}

// Status job scrape mutasi bank — lihat components/bank-mutation/JobsClient.tsx.
export const scrapeJobStatusMeta: Record<string, StatusMeta> = {
  SUCCESS: { label: 'SUCCESS', tone: 'success' },
  FAILED: { label: 'FAILED', tone: 'danger' },
  RUNNING: { label: 'RUNNING', tone: 'info' },
}

// Helper aman: ambil meta dari map, fallback ke neutral dengan label apa adanya
// supaya status baru/tak dikenal tidak bikin UI kosong/crash.
export function statusMeta(
  map: Record<string, StatusMeta>,
  status: string,
): StatusMeta {
  return map[status] ?? { label: status, tone: 'neutral' }
}
