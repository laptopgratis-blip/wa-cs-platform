'use client'

// Stats strip di header /pesanan — total pesanan (Rp + jumlah), sudah dibayar
// (PAID by paidAt), belum dibayar (COD + transfer pending), dan urgent count.
// Periode bisa dipilih: Hari ini (WIB) / 12 jam / 24 jam / 7 hari / custom
// rentang tanggal — supaya sesi live malam yang melewati pergantian hari
// tetap terlihat utuh. Angka dihitung server (/api/orders → totals).
import { AlertCircle, Clock3, ShoppingBag, TrendingUp } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { TONES, type Tone } from '@/lib/ui-tones'

import type { StatsRange } from './types'

interface Props {
  todayCount: number
  todayTotalRp: number
  todayUnpaidRp: number
  todayPaidRp: number
  urgentCount: number
  range: StatsRange
  customFrom: string
  customTo: string
  onRangeChange: (r: StatsRange) => void
  onCustomFromChange: (v: string) => void
  onCustomToChange: (v: string) => void
  onClickUrgent?: () => void
}

const RANGE_OPTIONS: Array<{ key: StatsRange; label: string }> = [
  { key: 'today', label: 'Hari ini' },
  { key: '12h', label: '12 jam' },
  { key: '24h', label: '24 jam' },
  { key: '7d', label: '7 hari' },
  { key: 'custom', label: 'Pilih tanggal' },
]

const RANGE_DESC: Record<StatsRange, string> = {
  today: 'hari ini (WIB)',
  '12h': '12 jam terakhir',
  '24h': '24 jam terakhir',
  '7d': '7 hari terakhir',
  custom: 'periode dipilih',
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
  range,
  customFrom,
  customTo,
  onRangeChange,
  onCustomFromChange,
  onCustomToChange,
  onClickUrgent,
}: Props) {
  const desc = RANGE_DESC[range]
  return (
    <div className="space-y-2">
      {/* ── Pemilih periode strip ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-warm-500 text-xs font-medium">Periode:</span>
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onRangeChange(opt.key)}
            aria-pressed={range === opt.key}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              range === opt.key
                ? 'border-primary-500 bg-primary-500 text-white'
                : 'border-warm-300 text-warm-700 hover:bg-warm-50 bg-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
        {range === 'custom' && (
          <span className="flex items-center gap-1.5">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
              className="h-7 w-auto px-2 text-xs"
              aria-label="Statistik dari tanggal"
            />
            <span className="text-warm-500 text-xs">—</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
              className="h-7 w-auto px-2 text-xs"
              aria-label="Statistik sampai tanggal"
            />
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Stat
          icon={<ShoppingBag className="size-4" />}
          label={`Total pesanan (${desc})`}
          value={formatRp(todayTotalRp)}
          sub={`${todayCount.toLocaleString('id-ID')} order masuk`}
          accent="brand"
        />
        <Stat
          icon={<TrendingUp className="size-4" />}
          label="Sudah dibayar"
          value={formatRp(todayPaidRp)}
          sub="Dilunasi dalam periode ini"
          accent="success"
        />
        <Stat
          icon={<Clock3 className="size-4" />}
          label="Belum dibayar (COD + transfer)"
          value={formatRp(todayUnpaidRp)}
          sub="Potensi revenue periode ini"
          accent="info"
        />
        <Stat
          icon={<AlertCircle className="size-4" />}
          label="Urgent (>12 jam)"
          value={urgentCount.toLocaleString('id-ID')}
          sub={urgentCount > 0 ? 'Klik untuk lihat' : 'Aman'}
          accent={urgentCount > 0 ? 'warning' : 'neutral'}
          onClick={urgentCount > 0 ? onClickUrgent : undefined}
        />
      </div>
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
  accent: Extract<Tone, 'brand' | 'success' | 'info' | 'warning' | 'neutral'>
  onClick?: () => void
}) {
  const t = TONES[accent]
  const tone = `${t.border} ${t.bg} ${t.text}`
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
        {sub ? <p className="truncate text-xs opacity-60">{sub}</p> : null}
      </div>
    </Tag>
  )
}
