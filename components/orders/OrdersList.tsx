'use client'

// Halaman utama /pesanan — orchestrator state + fetching.
// Sub-component: OrdersStatsStrip, OrdersFilterBar, OrdersTable / OrderCardView,
// OrdersBulkActionBar, OrderDetailDialog.
//
// View mode (table vs card) di-persist ke localStorage. Default: table —
// lebih cocok untuk admin yang kelola ratusan order/hari.
//
// Phase 1 Custom Columns (2026-05-08): kolom yang aktif + sort di-persist ke
// server via UserOrderViewPreference (hook useViewPreference). Tabel render
// driven by `visibleColumns`. Tags + Notes Admin via inline edit.
import { Columns, Download, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import { ColumnPickerModal } from './ColumnPickerModal'
import { OrderCardView } from './OrderCardView'
import { OrderDetailDialog } from './OrderDetailDialog'
import { OrdersBulkActionBar } from './OrdersBulkActionBar'
import { OrdersFilterBar } from './OrdersFilterBar'
import { OrdersStatsStrip } from './OrdersStatsStrip'
import { OrdersTable } from './OrdersTable'
import { TagPickerDialog } from './TagPickerDialog'
import type {
  OrderListItem,
  OrderTagBadge,
  OrdersCounts,
  OrdersTotals,
  QuickAction,
  SmartFilter,
  ViewMode,
} from './types'
import { useViewPreference } from './useViewPreference'

// Re-export untuk backward compat (page.tsx lama import dari sini).
export type { OrderListItem, OrdersCounts } from './types'

const VIEW_KEY = 'hulao.orders.view'
const PAGE_LIMIT = 50

const ZERO_COUNTS: OrdersCounts = {
  all: 0,
  pending: 0,
  paid: 0,
  shipped: 0,
  completed: 0,
}
const ZERO_TOTALS: OrdersTotals = {
  todayCount: 0,
  todayPaidRp: 0,
  urgentCount: 0,
}

export function OrdersList() {
  const [tab, setTab] = useState<keyof OrdersCounts>('all')
  const [smart, setSmart] = useState<SmartFilter | null>(null)
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'TRANSFER' | null>(
    null,
  )
  // Lazy init dari localStorage — jalan sekali di client, hindari setState
  // di effect (react-hooks/set-state-in-effect rule).
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'table'
    const saved = window.localStorage.getItem(VIEW_KEY)
    return saved === 'card' ? 'card' : 'table'
  })

  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [counts, setCounts] = useState<OrdersCounts>(ZERO_COUNTS)
  const [totals, setTotals] = useState<OrdersTotals>(ZERO_TOTALS)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)

  // Custom columns + sort dari preference user.
  const { pref: viewPref, update: updateViewPref } = useViewPreference()

  // Tag picker state — open per order.
  const [tagPickerOrder, setTagPickerOrder] = useState<OrderListItem | null>(
    null,
  )

  // Column picker modal.
  const [columnPickerOpen, setColumnPickerOpen] = useState(false)

  // Persist view ke localStorage saat berubah. Tidak setState — jadi aman
  // di useEffect.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(VIEW_KEY, view)
  }, [view])

  // Build query string dari filter.
  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    p.set('tab', String(tab))
    if (smart) p.set('f', smart)
    if (search.trim()) p.set('q', search.trim())
    if (from) p.set('from', new Date(from).toISOString())
    if (to) {
      const end = new Date(to)
      end.setHours(23, 59, 59, 999)
      p.set('to', end.toISOString())
    }
    if (paymentMethod) p.set('pm', paymentMethod)
    if (viewPref.sortColumn) p.set('sort', viewPref.sortColumn)
    if (viewPref.sortDirection) p.set('dir', viewPref.sortDirection)
    p.set('limit', String(PAGE_LIMIT))
    return p.toString()
  }, [
    tab,
    smart,
    search,
    from,
    to,
    paymentMethod,
    viewPref.sortColumn,
    viewPref.sortDirection,
  ])

  // Initial / refetch saat filter berubah. Debounce search 300ms.
  useEffect(() => {
    const debounceMs = search ? 300 : 0
    let cancelled = false
    const tid = setTimeout(() => {
      ;(async () => {
        try {
          const res = await fetch(`/api/orders?${queryString}`, {
            cache: 'no-store',
          })
          const json = await res.json()
          if (cancelled) return
          if (!res.ok || !json.success) {
            toast.error(json.error ?? 'Gagal memuat pesanan')
            return
          }
          setOrders(json.data.orders)
          setCounts(json.data.counts)
          setTotals(json.data.totals)
          setNextCursor(json.data.nextCursor ?? null)
          setSelectedIds(new Set())
        } catch (e) {
          if (cancelled) return
          toast.error(e instanceof Error ? e.message : 'Network error')
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    }, debounceMs)
    return () => {
      cancelled = true
      clearTimeout(tid)
    }
  }, [queryString, reloadKey, search])

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(
        `/api/orders?${queryString}&cursor=${encodeURIComponent(nextCursor)}`,
        { cache: 'no-store' },
      )
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error ?? 'Gagal memuat halaman berikutnya')
        return
      }
      setOrders((prev) => [...prev, ...json.data.orders])
      setNextCursor(json.data.nextCursor ?? null)
    } finally {
      setLoadingMore(false)
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (prev.size >= orders.length) return new Set()
      return new Set(orders.map((o) => o.id))
    })
  }

  async function quickAction(order: OrderListItem, action: QuickAction) {
    const body: Record<string, unknown> = {}
    if (action === 'mark_paid') body.paymentStatus = 'PAID'
    if (action === 'mark_shipped') body.deliveryStatus = 'SHIPPED'
    if (action === 'mark_delivered') body.deliveryStatus = 'DELIVERED'
    if (action === 'reject') {
      const reason = window.prompt('Alasan penolakan (opsional):') ?? ''
      body.paymentStatus = 'CANCELLED'
      body.deliveryStatus = 'CANCELLED'
      if (reason.trim()) body.cancelledReason = reason.trim()
    }

    const res = await fetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as
      | { success: boolean; error?: string }
      | null
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Gagal memperbarui status')
      return
    }
    toast.success(
      action === 'mark_paid'
        ? 'Ditandai lunas'
        : action === 'mark_shipped'
          ? 'Ditandai dikirim'
          : action === 'mark_delivered'
            ? 'Ditandai selesai'
            : 'Order ditolak',
    )
    reload()
  }

  async function bulkAction(action: QuickAction) {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const labelMap: Record<QuickAction, string> = {
      mark_paid: 'lunas',
      mark_shipped: 'dikirim',
      mark_delivered: 'selesai',
      reject: 'tolak',
    }
    if (
      !confirm(
        `Tandai ${ids.length} pesanan sebagai ${labelMap[action]}?`,
      )
    ) {
      return
    }
    let cancelledReason: string | undefined
    if (action === 'reject') {
      cancelledReason =
        window.prompt('Alasan penolakan (opsional):')?.trim() || undefined
    }

    setBulkBusy(true)
    try {
      const res = await fetch('/api/orders/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: ids, action, cancelledReason }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error ?? 'Bulk update gagal')
        return
      }
      const d = json.data
      toast.success(
        `${d.updated} di-update, ${d.skipped} di-skip${
          d.failed > 0 ? `, ${d.failed} gagal` : ''
        }`,
      )
      setSelectedIds(new Set())
      reload()
    } finally {
      setBulkBusy(false)
    }
  }

  async function updateTracking(orderId: string, value: string) {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingNumber: value || null }),
    })
    const json = (await res.json().catch(() => null)) as
      | { success: boolean; error?: string }
      | null
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Gagal update resi')
      return
    }
    toast.success('Resi tersimpan')
    reload()
  }

  async function refirePixel(order: OrderListItem) {
    if (!order.invoiceNumber) return
    const eventName: 'Purchase' | 'Lead' =
      order.paymentStatus === 'PAID' || order.paymentMethod === 'COD'
        ? 'Purchase'
        : order.pixelLeadFiredAt
          ? 'Purchase'
          : 'Lead'
    try {
      const res = await fetch(`/api/orders/${order.id}/refire-pixel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventName }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error ?? 'Gagal re-fire pixel')
        return
      }
      const d = json.data
      if (d.succeeded > 0) {
        toast.success(`${eventName} fired — ${d.succeeded} sukses`)
      } else if (d.skipped > 0 && d.fired === 0) {
        toast.info(`${eventName} sudah pernah fired — di-skip`)
      } else {
        toast.warning(`${eventName} dicoba tapi gagal — cek logs`)
      }
      reload()
    } catch {
      toast.error('Network error')
    }
  }

  function exportCsv() {
    const p = new URLSearchParams(queryString)
    p.delete('limit')
    window.open(`/api/orders/export?${p.toString()}`, '_blank')
  }

  // Toggle sort: kalau klik kolom yang sama → flip direction. Kalau beda → set
  // baru, default desc (paling sering yang user mau lihat untuk tanggal/total).
  function handleToggleSort(key: string) {
    if (viewPref.sortColumn === key) {
      const next = viewPref.sortDirection === 'asc' ? 'desc' : 'asc'
      updateViewPref({ sortDirection: next })
    } else {
      updateViewPref({ sortColumn: key, sortDirection: 'desc' })
    }
  }

  // Patch local state ketika tag set diupdate per order — hindari full reload
  // supaya UX cepat. Server sudah authoritative.
  function handleTagsSaved(orderId: string, tags: OrderTagBadge[]) {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, tags } : o)),
    )
  }

  function handleNotesAdminSaved(orderId: string, value: string | null) {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, notesAdmin: value } : o)),
    )
  }

  function handleSaveColumns(columns: string[]) {
    updateViewPref({ visibleColumns: columns })
  }

  function clearAllFilters() {
    setSmart(null)
    setSearch('')
    setFrom('')
    setTo('')
    setPaymentMethod(null)
  }

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
            Pesanan Masuk
          </h1>
          <p className="mt-0.5 text-sm text-warm-500">
            Kelola order COD & Transfer dari semua channel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setColumnPickerOpen(true)}
            title="Atur kolom yang tampil di tabel"
          >
            <Columns className="mr-2 size-4" />
            Kolom
            <span className="ml-1.5 rounded-full bg-warm-100 px-1.5 text-[10px] font-semibold text-warm-700 dark:bg-warm-800 dark:text-warm-200">
              {viewPref.visibleColumns.length}
            </span>
          </Button>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <OrdersStatsStrip
        todayCount={totals.todayCount}
        todayPaidRp={totals.todayPaidRp}
        urgentCount={totals.urgentCount}
        onClickUrgent={() => {
          setSmart('urgent')
          setTab('all')
        }}
      />

      <OrdersFilterBar
        tab={tab}
        smart={smart}
        search={search}
        from={from}
        to={to}
        paymentMethod={paymentMethod}
        counts={counts}
        urgentCount={totals.urgentCount}
        view={view}
        onTabChange={(v) => {
          setTab(v)
          setSmart(null) // tab dan smart mutually exclusive di server
        }}
        onSmartChange={setSmart}
        onSearchChange={setSearch}
        onFromChange={setFrom}
        onToChange={setTo}
        onPaymentMethodChange={setPaymentMethod}
        onViewChange={setView}
        onClearAll={clearAllFilters}
      />

      {view === 'table' ? (
        <OrdersTable
          orders={orders}
          selectedIds={selectedIds}
          visibleColumns={viewPref.visibleColumns}
          sortColumn={viewPref.sortColumn}
          sortDirection={viewPref.sortDirection}
          onToggleSort={handleToggleSort}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onOpenDetail={setDetailId}
          onQuickAction={quickAction}
          onUpdateTracking={updateTracking}
          onOpenTagPicker={(o) => setTagPickerOrder(o)}
          onNotesAdminSaved={handleNotesAdminSaved}
          loading={loading}
        />
      ) : (
        <OrderCardView
          orders={orders}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onOpenDetail={setDetailId}
          onQuickAction={quickAction}
          onRefirePixel={refirePixel}
          loading={loading}
        />
      )}

      {nextCursor && (
        <div className="flex justify-center py-2">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore && <Loader2 className="mr-2 size-4 animate-spin" />}
            Muat lebih banyak
          </Button>
        </div>
      )}

      <OrdersBulkActionBar
        selectedCount={selectedIds.size}
        busy={bulkBusy}
        onAction={bulkAction}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Key supaya dialog remount fresh per orderId — initial state loading=true
          works tanpa setState di body effect. */}
      <OrderDetailDialog
        key={detailId ?? 'closed'}
        orderId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={reload}
      />

      <ColumnPickerModal
        open={columnPickerOpen}
        onOpenChange={setColumnPickerOpen}
        visibleColumns={viewPref.visibleColumns}
        onSave={handleSaveColumns}
      />

      <TagPickerDialog
        open={!!tagPickerOrder}
        onOpenChange={(open) => {
          if (!open) setTagPickerOrder(null)
        }}
        orderId={tagPickerOrder?.id ?? null}
        initialTags={tagPickerOrder?.tags ?? []}
        onSaved={(tags) => {
          if (tagPickerOrder) handleTagsSaved(tagPickerOrder.id, tags)
        }}
      />
    </>
  )
}
