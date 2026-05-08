'use client'

// Compact table view untuk /pesanan. 1 row per order. Sticky header.
//
// Custom columns Phase 1 (2026-05-08): kolom yang dirender di-driven oleh
// `visibleColumns` array (dari UserOrderViewPreference). Render tiap cell via
// `renderCell()` yang dispatch berdasarkan `renderType` di lib/order-columns.
// Kolom Aksi tetap fixed di kanan (selalu tampil).
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronRight,
  Loader2,
  MessageCircle,
  Tag,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatRelativeTime } from '@/lib/format-time'
import {
  getColumnByKey,
  resolveVisibleColumns,
  type OrderColumn,
} from '@/lib/order-columns'

import { InlineNotesAdmin } from './InlineNotesAdmin'
import type { OrderListItem, QuickAction } from './types'

interface Props {
  orders: OrderListItem[]
  selectedIds: Set<string>
  visibleColumns: string[]
  sortColumn: string | null
  sortDirection: 'asc' | 'desc' | null
  onToggleSort: (key: string) => void
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onOpenDetail: (id: string) => void
  onQuickAction: (order: OrderListItem, action: QuickAction) => void
  onUpdateTracking: (orderId: string, value: string) => Promise<void>
  onOpenTagPicker: (order: OrderListItem) => void
  onNotesAdminSaved: (orderId: string, value: string | null) => void
  loading: boolean
}

export function OrdersTable({
  orders,
  selectedIds,
  visibleColumns,
  sortColumn,
  sortDirection,
  onToggleSort,
  onToggleSelect,
  onToggleSelectAll,
  onOpenDetail,
  onQuickAction,
  onUpdateTracking,
  onOpenTagPicker,
  onNotesAdminSaved,
  loading,
}: Props) {
  const allChecked = orders.length > 0 && selectedIds.size >= orders.length
  const partiallyChecked = selectedIds.size > 0 && !allChecked

  // Resolve columns (defensive — fallback ke default kalau prefs kosong/aneh).
  const cols = resolveVisibleColumns(visibleColumns)
    .map(getColumnByKey)
    .filter((c): c is OrderColumn => Boolean(c))

  // +2 untuk checkbox col + actions col (untuk colSpan empty state).
  const totalColCount = cols.length + 2

  return (
    <div className="rounded-lg border bg-white dark:bg-warm-950">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-warm-50 dark:bg-warm-900">
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    allChecked ? true : partiallyChecked ? 'indeterminate' : false
                  }
                  onCheckedChange={onToggleSelectAll}
                  aria-label="Pilih semua"
                />
              </TableHead>
              {cols.map((col) => (
                <TableHead
                  key={col.key}
                  className={`${col.width ?? ''} ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : ''
                  }`}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => onToggleSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-warm-900 dark:hover:text-warm-50"
                    >
                      {col.label}
                      <SortIndicator
                        active={sortColumn === col.key}
                        direction={sortDirection}
                      />
                    </button>
                  ) : (
                    col.label
                  )}
                </TableHead>
              ))}
              <TableHead className="w-[140px] text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalColCount} className="py-8 text-center">
                  <Loader2 className="inline size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={totalColCount}
                  className="py-12 text-center text-muted-foreground"
                >
                  Tidak ada pesanan dengan filter ini.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  cols={cols}
                  selected={selectedIds.has(order.id)}
                  onToggleSelect={() => onToggleSelect(order.id)}
                  onOpenDetail={() => onOpenDetail(order.id)}
                  onQuickAction={onQuickAction}
                  onUpdateTracking={onUpdateTracking}
                  onOpenTagPicker={() => onOpenTagPicker(order)}
                  onNotesAdminSaved={(v) => onNotesAdminSaved(order.id, v)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean
  direction: 'asc' | 'desc' | null
}) {
  if (!active) return <ArrowUpDown className="size-3 text-warm-400" />
  return direction === 'asc' ? (
    <ArrowUp className="size-3 text-primary-600" />
  ) : (
    <ArrowDown className="size-3 text-primary-600" />
  )
}

function OrderRow({
  order,
  cols,
  selected,
  onToggleSelect,
  onOpenDetail,
  onQuickAction,
  onUpdateTracking,
  onOpenTagPicker,
  onNotesAdminSaved,
}: {
  order: OrderListItem
  cols: OrderColumn[]
  selected: boolean
  onToggleSelect: () => void
  onOpenDetail: () => void
  onQuickAction: (o: OrderListItem, a: QuickAction) => void
  onUpdateTracking: (id: string, v: string) => Promise<void>
  onOpenTagPicker: () => void
  onNotesAdminSaved: (value: string | null) => void
}) {
  const isUnpaid =
    order.paymentStatus === 'PENDING' ||
    order.paymentStatus === 'WAITING_CONFIRMATION'
  const isWaitingConf = order.paymentStatus === 'WAITING_CONFIRMATION'
  const isPaid = order.paymentStatus === 'PAID'
  const isShipped = order.deliveryStatus === 'SHIPPED'
  const isDelivered = order.deliveryStatus === 'DELIVERED'
  const isCancelled =
    order.paymentStatus === 'CANCELLED' || order.deliveryStatus === 'CANCELLED'

  return (
    <TableRow
      className={`${selected ? 'bg-primary-50 dark:bg-primary-950/30' : ''} ${
        isCancelled ? 'opacity-60' : ''
      } cursor-pointer hover:bg-warm-50 dark:hover:bg-warm-900/50`}
      onClick={onOpenDetail}
    >
      <TableCell onClick={(e) => e.stopPropagation()} className="w-10">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label={`Pilih ${order.invoiceNumber ?? order.id}`}
        />
      </TableCell>
      {cols.map((col) => (
        <TableCell
          key={col.key}
          className={
            col.align === 'right'
              ? 'text-right'
              : col.align === 'center'
                ? 'text-center'
                : ''
          }
          onClick={(e) => {
            // Cell yang punya inline interaction tidak boleh trigger detail.
            if (
              col.renderType === 'tracking-number' ||
              col.renderType === 'notes-admin' ||
              col.renderType === 'tags'
            ) {
              e.stopPropagation()
            }
          }}
        >
          {renderCell(col, order, {
            onUpdateTracking,
            onOpenTagPicker,
            onNotesAdminSaved,
          })}
        </TableCell>
      ))}
      <TableCell
        onClick={(e) => e.stopPropagation()}
        className="text-right"
      >
        <div className="flex flex-wrap items-center justify-end gap-1">
          {isUnpaid && (
            <Button
              size="sm"
              variant="outline"
              className={
                isWaitingConf
                  ? 'h-7 border-emerald-300 bg-emerald-50 px-2 text-[11px] text-emerald-800'
                  : 'h-7 px-2 text-[11px]'
              }
              onClick={() => onQuickAction(order, 'mark_paid')}
              title={isWaitingConf ? 'Konfirmasi Bayar' : 'Tandai Lunas'}
            >
              <Check className="size-3" />
            </Button>
          )}
          {isPaid && !isShipped && !isDelivered && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => onQuickAction(order, 'mark_shipped')}
              title="Tandai Dikirim"
            >
              📦
            </Button>
          )}
          {isShipped && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => onQuickAction(order, 'mark_delivered')}
              title="Tandai Selesai"
            >
              ✅
            </Button>
          )}
          {isUnpaid && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-1 text-[11px] text-destructive hover:bg-destructive/10"
              onClick={() => onQuickAction(order, 'reject')}
              title="Tolak"
            >
              <X className="size-3" />
            </Button>
          )}
          {order.contactId && (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              title="Buka chat"
            >
              <Link
                href={`/inbox?contact=${order.contactId}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MessageCircle className="size-3" />
              </Link>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={onOpenDetail}
            title="Detail"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ─────────────────────────────────────────
// Cell renderer — dispatch by column.renderType.
// ─────────────────────────────────────────

function renderCell(
  col: OrderColumn,
  order: OrderListItem,
  handlers: {
    onUpdateTracking: (id: string, v: string) => Promise<void>
    onOpenTagPicker: () => void
    onNotesAdminSaved: (value: string | null) => void
  },
): React.ReactNode {
  switch (col.renderType) {
    case 'invoice':
      return <InvoiceCell order={order} />
    case 'datetime':
      return formatDateTime(getStringValue(order, col.key))
    case 'currency':
      return formatRupiah(getNumberValue(order, col.key))
    case 'flash-sale-discount': {
      const v = getNumberValue(order, col.key)
      if (!v) return <DashCell />
      return <span className="text-orange-600">-{formatRupiah(v)}</span>
    }
    case 'badge-payment-status':
      return <PaymentBadge status={order.paymentStatus} />
    case 'badge-delivery-status':
      return <DeliveryBadge status={order.deliveryStatus} />
    case 'badge-payment-method':
      return (
        <Badge variant="outline" className="text-[10px]">
          {order.paymentMethod}
        </Badge>
      )
    case 'phone':
      return order.customerPhone ? (
        <span className="font-mono text-xs">{order.customerPhone}</span>
      ) : (
        <DashCell />
      )
    case 'address':
      return <AddressCell order={order} />
    case 'tags':
      return <TagsCell order={order} onOpenPicker={handlers.onOpenTagPicker} />
    case 'auto-confirm':
      return <AutoConfirmCell order={order} />
    case 'pixel-status':
      return <PixelStatusCell order={order} />
    case 'utm':
      return getStringValue(order, col.key) ? (
        <span className="font-mono text-xs">{getStringValue(order, col.key)}</span>
      ) : (
        <DashCell />
      )
    case 'tracking-number':
      return (
        <TrackingCell
          orderId={order.id}
          value={order.trackingNumber}
          courier={order.shippingCourier}
          editable={order.deliveryStatus === 'SHIPPED'}
          onUpdate={handlers.onUpdateTracking}
        />
      )
    case 'notes-admin':
      return (
        <InlineNotesAdmin
          orderId={order.id}
          value={order.notesAdmin ?? null}
          onSaved={handlers.onNotesAdminSaved}
        />
      )
    case 'order-form-name':
      return order.orderForm?.name ? (
        <span className="text-xs">{order.orderForm.name}</span>
      ) : (
        <DashCell />
      )
    case 'text': {
      // Special-case kolom customer (utama) — tetap render compound layout
      // (nama + phone + city) supaya UX existing tidak hilang.
      if (col.key === 'customerName') return <CustomerCell order={order} />
      const v = getStringValue(order, col.key)
      return v ? <span className="text-xs">{v}</span> : <DashCell />
    }
    default:
      return <DashCell />
  }
}

function getStringValue(order: OrderListItem, key: string): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (order as any)[key]
  if (v == null) return null
  return String(v)
}
function getNumberValue(order: OrderListItem, key: string): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (order as any)[key]
  if (typeof v !== 'number') return 0
  return v
}

function formatRupiah(n: number): React.ReactNode {
  if (!n) return <span className="text-warm-400">—</span>
  return (
    <span className="font-semibold tabular-nums">
      Rp {n.toLocaleString('id-ID')}
    </span>
  )
}

function formatDateTime(iso: string | null): React.ReactNode {
  if (!iso) return <DashCell />
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return <DashCell />
  return (
    <div className="text-xs">
      <div>
        {d.toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}
      </div>
      <div className="text-[10px] text-warm-500">
        {d.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </div>
  )
}

function DashCell() {
  return <span className="text-warm-400">—</span>
}

function InvoiceCell({ order }: { order: OrderListItem }) {
  const [renderTime] = useState(() => Date.now())
  const isNew = renderTime - new Date(order.createdAt).getTime() < 60 * 60 * 1000
  return (
    <div className="space-y-0.5">
      {order.invoiceNumber ? (
        <p className="font-mono text-xs font-medium">{order.invoiceNumber}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {order.flowName ?? '—'}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {isNew && (
          <span className="mr-1 rounded bg-emerald-500 px-1 py-0.5 text-[9px] font-bold text-white">
            BARU
          </span>
        )}
        {formatRelativeTime(order.createdAt)}
      </p>
    </div>
  )
}

function CustomerCell({ order }: { order: OrderListItem }) {
  return (
    <div className="space-y-0.5">
      <p className="line-clamp-1 text-sm font-medium">{order.customerName}</p>
      <p className="text-[11px] text-muted-foreground">
        {order.customerPhone}
      </p>
      {(order.shippingCityName || order.customerAddress) && (
        <p className="line-clamp-1 text-[11px] text-muted-foreground">
          📍 {order.shippingCityName ?? order.customerAddress}
        </p>
      )}
    </div>
  )
}

function AddressCell({ order }: { order: OrderListItem }) {
  const addr = order.shippingAddress ?? order.customerAddress
  if (!addr) return <DashCell />
  return (
    <div className="text-xs">
      <p className="line-clamp-2">{addr}</p>
      {(order.shippingCityName || order.shippingProvinceName) && (
        <p className="text-[10px] text-warm-500">
          {[order.shippingCityName, order.shippingProvinceName]
            .filter(Boolean)
            .join(', ')}
        </p>
      )}
    </div>
  )
}

function TagsCell({
  order,
  onOpenPicker,
}: {
  order: OrderListItem
  onOpenPicker: () => void
}) {
  const tags = order.tags ?? []
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span
          key={t.id}
          className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
          style={{ backgroundColor: t.color }}
        >
          {t.name}
        </span>
      ))}
      <button
        type="button"
        onClick={onOpenPicker}
        className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-warm-300 px-1.5 py-0.5 text-[10px] text-warm-500 hover:bg-warm-50"
      >
        <Tag className="size-2.5" />
        {tags.length === 0 ? 'Tag' : ''}
      </button>
    </div>
  )
}

function AutoConfirmCell({ order }: { order: OrderListItem }) {
  if (!order.autoConfirmedBy) return <DashCell />
  const map: Record<string, string> = {
    BCA_AUTO: '🤖 BCA Auto',
    MOOTA: '🤖 Moota',
    MANUAL: '👤 Manual',
  }
  return (
    <Badge variant="outline" className="text-[10px]">
      {map[order.autoConfirmedBy] ?? order.autoConfirmedBy}
    </Badge>
  )
}

function PixelStatusCell({ order }: { order: OrderListItem }) {
  const lead = !!order.pixelLeadFiredAt
  const purchase = !!order.pixelPurchaseFiredAt
  if (!lead && !purchase) return <DashCell />
  return (
    <div className="space-y-0.5 text-[10px]">
      {lead && <div className="text-emerald-700">✓ Lead</div>}
      {purchase && <div className="text-emerald-700">✓ Purchase</div>}
    </div>
  )
}

function TrackingCell({
  orderId,
  value,
  courier,
  editable,
  onUpdate,
}: {
  orderId: string
  value: string | null
  courier: string | null | undefined
  editable: boolean
  onUpdate: (id: string, v: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)

  if (!editable && !value) {
    return <span className="text-[11px] text-muted-foreground">—</span>
  }

  if (editing) {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={async (e) => {
          e.preventDefault()
          setSaving(true)
          try {
            await onUpdate(orderId, draft.trim())
            setEditing(false)
          } finally {
            setSaving(false)
          }
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          className="h-7 text-xs"
          placeholder="No. resi"
        />
        <Button type="submit" size="sm" className="h-7 px-2" disabled={saving}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-1"
          onClick={() => {
            setDraft(value ?? '')
            setEditing(false)
          }}
        >
          <X className="size-3" />
        </Button>
      </form>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="block w-full rounded px-1 py-0.5 text-left text-xs hover:bg-warm-100 dark:hover:bg-warm-800"
      title="Klik untuk edit"
    >
      {value ? (
        <>
          <p className="line-clamp-1 font-mono">{value}</p>
          {courier && (
            <p className="text-[10px] text-muted-foreground">
              {courier.toUpperCase()}
            </p>
          )}
        </>
      ) : (
        <span className="text-[11px] italic text-amber-700">+ Tambah resi</span>
      )}
    </button>
  )
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-900',
    WAITING_CONFIRMATION: 'bg-orange-100 text-orange-900',
    PAID: 'bg-emerald-100 text-emerald-900',
    CANCELLED: 'bg-warm-100 text-warm-700',
  }
  const label: Record<string, string> = {
    PENDING: '⏳ Belum bayar',
    WAITING_CONFIRMATION: '🔍 Cek bukti',
    PAID: '✓ Lunas',
    CANCELLED: '✕ Batal',
  }
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
        map[status] ?? ''
      }`}
    >
      {label[status] ?? status}
    </span>
  )
}

function DeliveryBadge({ status }: { status: string }) {
  if (status === 'PENDING' || status === 'CANCELLED') {
    return <DashCell />
  }
  const map: Record<string, string> = {
    PROCESSING: 'bg-sky-100 text-sky-900',
    SHIPPED: 'bg-blue-100 text-blue-900',
    DELIVERED: 'bg-emerald-100 text-emerald-900',
  }
  const label: Record<string, string> = {
    PROCESSING: '⚙️ Proses',
    SHIPPED: '🚚 Dikirim',
    DELIVERED: '✅ Selesai',
  }
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
        map[status] ?? ''
      }`}
    >
      {label[status] ?? status}
    </span>
  )
}
