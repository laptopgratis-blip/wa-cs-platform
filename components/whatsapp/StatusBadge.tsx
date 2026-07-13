// Badge status koneksi WA — thin wrapper di atas shared <StatusBadge> supaya
// palette/dark pairs satu sumber. Label Indonesia + pulse untuk status aktif.
import {
  StatusBadge as SharedStatusBadge,
  type StatusTone,
} from '@/components/shared/StatusBadge'
import type { WaStatus } from '@/lib/socket-client'

const META: Record<WaStatus, { label: string; tone: StatusTone; pulse: boolean }> = {
  CONNECTED: { label: 'Terhubung', tone: 'success', pulse: true },
  WAITING_QR: { label: 'Menunggu QR', tone: 'warning', pulse: true },
  CONNECTING: { label: 'Menghubungkan', tone: 'neutral', pulse: true },
  DISCONNECTED: { label: 'Terputus', tone: 'neutral', pulse: false },
  PAUSED: { label: 'Dijeda', tone: 'info', pulse: true },
  ERROR: { label: 'Error', tone: 'danger', pulse: false },
}

export function StatusBadge({ status }: { status: WaStatus }) {
  // Defensive: kalau status undefined / nilai luar enum (mis. payload socket
  // dengan field hilang), fallback ke DISCONNECTED supaya UI tidak crash.
  const meta = META[status] ?? META.DISCONNECTED
  return (
    <SharedStatusBadge tone={meta.tone} label={meta.label} pulse={meta.pulse} />
  )
}
