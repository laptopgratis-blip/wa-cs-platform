'use client'

// Strip fulfillment per gudang (Fase 1 multi-gudang, 2026-07-13).
// Segmented control ala "data-dense dashboard": tiap chip = 1 gudang dengan
// angka "perlu dikemas". Klik → filter list ke gudang itu (batch pack via bulk
// bar yang sudah ada). Hanya tampil kalau user punya ≥2 gudang — seller
// 1-gudang tak perlu (perilaku lama).
import { Layers, Warehouse } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { WarehouseSummary } from './types'

// Nilai filter khusus untuk order tanpa gudang (gudang dihapus / order lama).
export const WAREHOUSE_NONE = '__none__'

interface Props {
  summary: WarehouseSummary | null
  // null = "Semua" (tanpa filter gudang). Selain itu id gudang / WAREHOUSE_NONE.
  active: string | null
  onSelect: (warehouseId: string | null) => void
}

export function OrdersWarehouseStrip({ summary, active, onSelect }: Props) {
  // Tampil hanya untuk seller multi-gudang.
  if (!summary || summary.warehouses.length < 2) return null

  return (
    <section aria-label="Proses pesanan per gudang" className="space-y-1.5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-warm-500">
        Proses per Gudang
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip
          icon={<Layers className="size-3.5" />}
          label="Semua"
          count={summary.total}
          unit="total"
          active={active === null}
          neutral
          onClick={() => onSelect(null)}
        />
        {summary.warehouses.map((w) => (
          <Chip
            key={w.warehouseId}
            icon={<Warehouse className="size-3.5" />}
            label={w.name}
            count={w.count}
            unit="dikemas"
            muted={!w.isActive}
            active={active === w.warehouseId}
            onClick={() => onSelect(w.warehouseId)}
          />
        ))}
        {summary.noneCount > 0 && (
          <Chip
            icon={<Warehouse className="size-3.5" />}
            label="Tanpa gudang"
            count={summary.noneCount}
            unit="dikemas"
            active={active === WAREHOUSE_NONE}
            onClick={() => onSelect(WAREHOUSE_NONE)}
          />
        )}
      </div>
    </section>
  )
}

function Chip({
  icon,
  label,
  count,
  unit,
  active,
  neutral,
  muted,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  count: number
  unit: string
  active: boolean
  neutral?: boolean // "Semua" — angka selalu netral, bukan amber
  muted?: boolean // gudang non-aktif
  onClick: () => void
}) {
  // Ada antrian → amber (perlu aksi); kosong → netral/hijau. "Semua" netral.
  const countTone =
    neutral || count === 0
      ? 'text-warm-400 dark:text-warm-500'
      : 'text-amber-600 dark:text-amber-400'

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex min-h-[52px] min-w-[116px] shrink-0 flex-col justify-center gap-0.5 rounded-lg border px-3 py-1.5 text-left transition-colors',
        active
          ? 'border-primary-500 bg-primary-50 dark:border-primary-500 dark:bg-primary-950/40'
          : 'border-warm-200 bg-white hover:bg-warm-50 dark:border-warm-800 dark:bg-warm-950 dark:hover:bg-warm-900',
        muted && 'opacity-60',
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-warm-600 dark:text-warm-300">
        <span className="shrink-0 text-warm-400">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className="flex items-baseline gap-1">
        <span className={cn('text-lg font-bold tabular-nums leading-none', countTone)}>
          {count}
        </span>
        <span className="text-[11px] text-warm-500">{unit}</span>
      </span>
    </button>
  )
}
