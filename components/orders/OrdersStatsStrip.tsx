'use client'

// Stats strip di header /pesanan — order hari ini + revenue + urgent count.
// Dipakai untuk admin lihat prioritas tanpa scroll list.
import { AlertCircle, ShoppingBag, TrendingUp } from 'lucide-react'

interface Props {
  todayCount: number
  todayPaidRp: number
  urgentCount: number
  onClickUrgent?: () => void
}

export function OrdersStatsStrip({
  todayCount,
  todayPaidRp,
  urgentCount,
  onClickUrgent,
}: Props) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <Stat
        icon={<ShoppingBag className="size-4" />}
        label="Order hari ini"
        value={todayCount.toLocaleString('id-ID')}
        accent="primary"
      />
      <Stat
        icon={<TrendingUp className="size-4" />}
        label="Revenue hari ini (PAID)"
        value={`Rp ${todayPaidRp.toLocaleString('id-ID')}`}
        accent="emerald"
      />
      <Stat
        icon={<AlertCircle className="size-4" />}
        label="Urgent (>12 jam)"
        value={urgentCount.toLocaleString('id-ID')}
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
  accent,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: 'primary' | 'emerald' | 'amber' | 'neutral'
  onClick?: () => void
}) {
  const tone = {
    primary: 'border-primary-200 bg-primary-50 text-primary-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
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
      </div>
    </Tag>
  )
}
