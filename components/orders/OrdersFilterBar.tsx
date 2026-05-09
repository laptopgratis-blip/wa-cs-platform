'use client'

// Filter bar untuk /pesanan: smart filter chips + tabs + search + date + payment method.
// Smart chips override tab (lebih spesifik). Klik chip aktif = clear chip.
import { LayoutGrid, List, Search, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { OrdersCounts, SmartFilter, ViewMode } from './types'

const TABS: Array<{ key: keyof OrdersCounts; label: string }> = [
  { key: 'all', label: 'Semua' },
  { key: 'pending', label: 'Menunggu' },
  { key: 'paid', label: 'Sudah Bayar' },
  { key: 'shipped', label: 'Dikirim' },
  { key: 'completed', label: 'Selesai' },
]

const SMART_CHIPS: Array<{
  key: SmartFilter
  label: string
  emoji: string
  description: string
}> = [
  {
    key: 'urgent',
    label: 'Urgent',
    emoji: '🔴',
    description: 'Belum bayar > 12 jam',
  },
  {
    key: 'need_ship',
    label: 'Perlu Kirim',
    emoji: '📦',
    description: 'PAID + belum dikirim',
  },
  {
    key: 'need_tracking',
    label: 'Butuh Resi',
    emoji: '📋',
    description: 'Dikirim tapi resi kosong',
  },
  { key: 'today', label: 'Hari Ini', emoji: '📆', description: 'Order hari ini' },
  {
    key: 'yesterday',
    label: 'Kemarin',
    emoji: '🗓️',
    description: 'Order kemarin',
  },
  {
    key: 'this_week',
    label: 'Minggu Ini',
    emoji: '📅',
    description: '7 hari terakhir',
  },
  {
    key: 'unpaid_24h',
    label: 'Belum Bayar > 24 jam',
    emoji: '⏰',
    description: 'PENDING/WAITING_CONFIRMATION lewat 24 jam',
  },
  {
    key: 'auto_confirmed',
    label: 'Auto-Confirmed',
    emoji: '🤖',
    description: 'Order yang status PAID-nya di-set otomatis (BCA/Moota)',
  },
]

const PM_NULL = '__ALL__'
const PRODUCT_NULL = '__ALL__'

interface Props {
  tab: keyof OrdersCounts
  smart: SmartFilter | null
  search: string
  from: string
  to: string
  paymentMethod: 'COD' | 'TRANSFER' | null
  productId: string | null
  productOptions: Array<{ id: string; name: string }>
  counts: OrdersCounts
  urgentCount: number
  view: ViewMode
  onTabChange: (tab: keyof OrdersCounts) => void
  onSmartChange: (s: SmartFilter | null) => void
  onSearchChange: (q: string) => void
  onFromChange: (d: string) => void
  onToChange: (d: string) => void
  onPaymentMethodChange: (pm: 'COD' | 'TRANSFER' | null) => void
  onProductChange: (id: string | null) => void
  onViewChange: (v: ViewMode) => void
  onClearAll: () => void
}

export function OrdersFilterBar({
  tab,
  smart,
  search,
  from,
  to,
  paymentMethod,
  productId,
  productOptions,
  counts,
  urgentCount,
  view,
  onTabChange,
  onSmartChange,
  onSearchChange,
  onFromChange,
  onToChange,
  onPaymentMethodChange,
  onProductChange,
  onViewChange,
  onClearAll,
}: Props) {
  const hasFilter =
    smart !== null ||
    search.length > 0 ||
    from.length > 0 ||
    to.length > 0 ||
    paymentMethod !== null ||
    productId !== null

  return (
    <div className="space-y-3">
      {/* Smart filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {SMART_CHIPS.map((c) => {
          const active = smart === c.key
          const showBadge = c.key === 'urgent' && urgentCount > 0
          return (
            <button
              key={c.key}
              type="button"
              title={c.description}
              onClick={() => onSmartChange(active ? null : c.key)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${
                active
                  ? 'border-primary-500 bg-primary-500 text-white shadow-sm'
                  : 'border-warm-300 bg-white text-warm-700 hover:bg-warm-100 dark:bg-warm-900 dark:text-warm-200'
              }`}
            >
              <span>{c.emoji}</span>
              <span className="font-medium">{c.label}</span>
              {showBadge && (
                <Badge
                  variant={active ? 'secondary' : 'destructive'}
                  className="h-4 px-1.5 text-[10px]"
                >
                  {urgentCount}
                </Badge>
              )}
            </button>
          )
        })}
        {hasFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-7 px-2 text-xs"
          >
            <X className="mr-1 size-3" /> Hapus filter
          </Button>
        )}
      </div>

      {/* Search + date + payment + view toggle */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari nama, HP, invoice INV-xxx, atau catatan..."
            className="pl-9"
          />
        </div>
        <Select
          value={paymentMethod ?? PM_NULL}
          onValueChange={(v) =>
            onPaymentMethodChange(
              v === PM_NULL ? null : (v as 'COD' | 'TRANSFER'),
            )
          }
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PM_NULL}>Semua Bayar</SelectItem>
            <SelectItem value="COD">COD</SelectItem>
            <SelectItem value="TRANSFER">Transfer</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={productId ?? PRODUCT_NULL}
          onValueChange={(v) => onProductChange(v === PRODUCT_NULL ? null : v)}
          disabled={productOptions.length === 0}
        >
          <SelectTrigger className="w-44">
            <SelectValue
              placeholder={
                productOptions.length === 0 ? 'Belum ada produk' : 'Semua Produk'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PRODUCT_NULL}>Semua Produk</SelectItem>
            {productOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            className="w-auto"
            aria-label="Dari tanggal"
          />
          <span className="text-sm text-muted-foreground">—</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            className="w-auto"
            aria-label="Sampai tanggal"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-warm-300 bg-white p-0.5 dark:bg-warm-900">
          <Button
            type="button"
            size="sm"
            variant={view === 'table' ? 'default' : 'ghost'}
            className="h-8 px-2"
            onClick={() => onViewChange('table')}
            title="Tampilan tabel padat"
          >
            <List className="size-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === 'card' ? 'default' : 'ghost'}
            className="h-8 px-2"
            onClick={() => onViewChange('card')}
            title="Tampilan kartu detail"
          >
            <LayoutGrid className="size-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => onTabChange(v as keyof OrdersCounts)}
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="gap-2">
              {t.label}
              <Badge variant="secondary" className="font-normal">
                {counts[t.key]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
