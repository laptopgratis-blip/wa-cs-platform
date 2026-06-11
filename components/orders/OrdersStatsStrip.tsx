'use client'

// Stats strip di header /pesanan — total pesanan hari ini (Rp + jumlah),
// sudah dibayar (PAID by paidAt), belum dibayar (COD + transfer pending),
// dan urgent count. Semua angka "hari ini" = hari WIB, dihitung server.
import { AlertCircle, Clock3, ShoppingBag, TrendingUp } from 'lucide-react'

interface Props {
  todayCount: number
  todayTotalRp: number
  todayUnpaidRp: number
  todayPaidRp: number
  urgentCount: number
  onClickUrgent?: () => void
}

function formatRp(n: number): string {
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`
}

export function OrdersStatsStrip({
  todayCount,
  todayTotalRp,
  todayUnpaidRp,
  todayPaidRp,
  urgentCount,
  onClickUrgent,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <Stat
        icon={<ShoppingBag className="size-4" />}
        label="Total pesanan hari ini"
        value={formatRp(todayTotalRp)}
        sub={`${todayCount.toLocaleString('id-ID')} order masuk`}
        accent="primary"
      />
      <Stat
        icon={<TrendingUp className="size-4" />}
        label="Sudah dibayar hari ini"
        value={formatRp(todayPaidRp)}
        sub="Termasuk order lama yang lunas hari ini"
        accent="emerald"
      />
      <Stat
        icon={<Clock3 className="size-4" />}
        label="Belum dibayar (COD + transfer)"
        value={formatRp(todayUnpaidRp)}
        sub="Potensi revenue pesanan hari ini"
        accent="sky"
      />
      <Stat
        icon={<AlertCircle className="size-4" />}
        label="Urgent (>12 jam)"
        value={urgentCount.toLocaleString('id-ID')}
        sub={urgentCount > 0 ? 'Klik untuk lihat' : 'Aman'}
        accent={urgentCount > 0 ? 'amber' : 'neutral'}
        onClick={urgentCount > 0 ? onClickUrgent : undefined}
      />
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  sub,
  accent,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  accent: 'primary' | 'emerald' | 'sky' | 'amber' | 'neutral'
  onClick?: () => void
}) {
  const tone = {
    primary: 'border-primary-200 bg-primary-50 text-primary-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    sky: 'border-sky-200 bg-sky-50 text-sky-900',
    amber: 'border-amber-300 bg-amber-50 text-amber-900',
    neutral: 'border-warm-200 bg-warm-50 text-warm-700',
  }[accent]
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex items-start gap-2 rounded-xl border p-3 text-left transition ${tone} ${
        onClick ? 'hover:brightness-95' : ''
      }`}
    >
      <span className="mt-0.5 opacity-70">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xs opacity-70">{label}</p>
        <p className="truncate text-base font-bold sm:text-lg">{value}</p>
        {sub ? <p className="truncate text-[11px] opacity-60">{sub}</p> : null}
      </div>
    </Tag>
  )
}
