// Badge yang menampilkan WaStatus dengan label, warna sesuai DESIGN_SYSTEM,
// plus dot kecil yang pulse untuk status aktif (CONNECTED, WAITING_QR).
import type { WaStatus } from '@/lib/socket-client'
import { cn } from '@/lib/utils'

const labels: Record<WaStatus, string> = {
  DISCONNECTED: 'Terputus',
  CONNECTING: 'Menghubungkan',
  WAITING_QR: 'Menunggu QR',
  CONNECTED: 'Terhubung',
  PAUSED: 'Dijeda',
  ERROR: 'Error',
}

// Warna pakai utility kelas Tailwind (bukan custom CSS) supaya konsisten.
const palette: Record<
  WaStatus,
  { bg: string; text: string; dot: string; pulse: boolean }
> = {
  CONNECTED: {
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    pulse: true,
  },
  WAITING_QR: {
    bg: 'bg-yellow-50 dark:bg-yellow-500/10',
    text: 'text-yellow-700 dark:text-yellow-300',
    dot: 'bg-yellow-500',
    pulse: true,
  },
  CONNECTING: {
    bg: 'bg-warm-100 dark:bg-warm-700/30',
    text: 'text-warm-600 dark:text-warm-300',
    dot: 'bg-warm-400',
    pulse: true,
  },
  DISCONNECTED: {
    bg: 'bg-warm-100 dark:bg-warm-700/30',
    text: 'text-warm-500 dark:text-warm-400',
    dot: 'bg-warm-400',
    pulse: false,
  },
  PAUSED: {
    bg: 'bg-primary-50 dark:bg-primary-500/10',
    text: 'text-primary-700 dark:text-primary-300',
    dot: 'bg-primary-500',
    pulse: true,
  },
  ERROR: {
    bg: 'bg-red-50 dark:bg-red-500/10',
    text: 'text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
    pulse: false,
  },
}

export function StatusBadge({ status }: { status: WaStatus }) {
  // Defensive: kalau status undefined / nilai luar enum (mis. payload socket
  // dengan field hilang), fallback ke DISCONNECTED supaya UI tidak crash.
  const safe: WaStatus = status && palette[status] ? status : 'DISCONNECTED'
  const p = palette[safe]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        p.bg,
        p.text,
      )}
    >
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', p.dot, p.pulse && 'animate-pulse-dot')}
      />
      {labels[safe]}
    </span>
  )
}
