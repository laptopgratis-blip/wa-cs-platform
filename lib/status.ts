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

// Helper aman: ambil meta dari map, fallback ke neutral dengan label apa adanya
// supaya status baru/tak dikenal tidak bikin UI kosong/crash.
export function statusMeta(
  map: Record<string, StatusMeta>,
  status: string,
): StatusMeta {
  return map[status] ?? { label: status, tone: 'neutral' }
}
