'use client'

// Compact table view untuk /pesanan. 1 row per order. Sticky header.
// Inline edit resi untuk SHIPPED tanpa resi. Bulk select via checkbox.
import {
  Check,
  ChevronRight,
  Loader2,
  MessageCircle,
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

import type { OrderListItem, QuickAction } from './types'

interface Props {
  orders: OrderListItem[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onOpenDetail: (id: string) => void
  onQuickAction: (order: OrderListItem, action: QuickAction) => void
  onUpdateTracking: (orderId: string, value: string) => Promise<void>
  loading: boolean
}

export function OrdersTable({
  orders,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onOpenDetail,
  onQuickAction,
  onUpdateTracking,
  loading,
}: Props) {
  const allChecked = orders.length > 0 && selectedIds.size >= orders.length
  const partiallyChecked = selectedIds.size > 0 && !allChecked

  return (
    <div className="rounded-lg border bg-white dark:bg-warm-950">
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
            <TableHead className="min-w-[140px]">Invoice / Waktu</TableHead>
            <TableHead className="min-w-[140px]">Customer</TableHead>
            <TableHead className="min-w-[100px] text-right">Total</TableHead>
            <TableHead>Bayar</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="min-w-[140px]">Resi</TableHead>
            <TableHead className="w-[140px] text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && orders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center">
                <Loader2 className="inline size-5 animate-spin" />
              </TableCell>
            </TableRow>
          ) : orders.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={8}
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
                selected={selectedIds.has(order.id)}
                onToggleSelect={() => onToggleSelect(order.id)}
                onOpenDetail={() => onOpenDetail(order.id)}
                onQuickAction={onQuickAction}
                onUpdateTracking={onUpdateTracking}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function OrderRow({
  order,
  selected,
  onToggleSelect,
  onOpenDetail,
  onQuickAction,
  onUpdateTracking,
}: {
  order: OrderListItem
  selected: boolean
  onToggleSelect: () => void
  onOpenDetail: () => void
  onQuickAction: (o: OrderListItem, a: QuickAction) => void
  onUpdateTracking: (id: string, v: string) => Promise<void>
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
  // Snapshot waktu render saat row pertama kali mount — hindari Date.now() di
  // body komponen (rule react-hooks/purity). Lazy useState init runs once.
  const [renderTime] = useState(() => Date.now())
  const isNew = renderTime - new Date(order.createdAt).getTime() < 60 * 60 * 1000
  const total = order.totalRp ?? order.totalAmount ?? 0

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
      <TableCell>
        <div className="space-y-0.5">
          {order.invoiceNumber ? (
            <p className="font-mono text-xs font-medium">
              {order.invoiceNumber}
            </p>
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
      </TableCell>
      <TableCell>
        <div className="space-y-0.5">
          <p className="line-clamp-1 text-sm font-medium">
            {order.customerName}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {order.customerPhone}
          </p>
          {(order.shippingCityName || order.customerAddress) && (
            <p className="line-clamp-1 text-[11px] text-muted-foreground">
              📍 {order.shippingCityName ?? order.customerAddress}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <p className="font-semibold tabular-nums">
          Rp {total.toLocaleString('id-ID')}
        </p>
        {order.paymentProofUrl && (
          <a
            href={order.paymentProofUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] text-primary-600 underline"
          >
            Lihat bukti
          </a>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px]">
          {order.paymentMethod}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <PaymentBadge status={order.paymentStatus} />
          <DeliveryBadge status={order.deliveryStatus} />
        </div>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <TrackingCell
          orderId={order.id}
          value={order.trackingNumber}
          courier={order.shippingCourier}
          editable={isShipped}
          onUpdate={onUpdateTracking}
        />
      </TableCell>
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
  if (status === 'PENDING' || status === 'CANCELLED') return null
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
