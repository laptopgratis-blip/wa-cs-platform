'use client'

// Halaman E-Book penjual: kartu stats total + daftar e-book (terjual, omzet,
// download) + drill-down pembeli per e-book (revoke/restore/kirim ulang link).
//
// Upload & edit metadata e-book dilakukan dari dialog Produk
// (components/products/EbookSection) — halaman ini fokus monitoring & aksi
// pembeli. E-book tanpa produk juga tampil (bisa dibuat dulu, link nanti).
import {
  BookOpen,
  Download,
  Loader2,
  RefreshCcw,
  Send,
  ShieldOff,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatNumber } from '@/lib/format'
import type { StatusMeta } from '@/lib/status'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface EbookStatsItem {
  id: string
  title: string
  coverUrl: string | null
  fileFormat: 'PDF' | 'EPUB'
  fileSizeBytes: number
  maxDownloads: number
  accessDays: number | null
  isActive: boolean
  product: { id: string; name: string; price: number } | null
  stats: {
    sold: number
    buyers: number
    revenueRp: number
    downloads: number
    active: number
    revoked: number
    expired: number
  }
}

interface BuyerItem {
  id: string
  buyerPhone: string
  buyerName: string | null
  buyerEmail: string | null
  invoiceNumber: string | null
  pricePaidRp: number | null
  purchaseCount: number
  totalPaidRp: number
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED'
  grantedAt: string
  expiresAt: string | null
  downloadCount: number
  maxDownloads: number
  accessNotifiedAt: string | null
  lastDownload: { status: string; at: string } | null
}

// Status akses e-book (EbookAccess.status) — label + tone dari registry.
const ACCESS_STATUS_META: Record<string, StatusMeta> = {
  ACTIVE: { label: 'ACTIVE', tone: 'success' },
  REVOKED: { label: 'REVOKED', tone: 'danger' },
  EXPIRED: { label: 'EXPIRED', tone: 'warning' },
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function EbookSalesClient() {
  const [items, setItems] = useState<EbookStatsItem[]>([])
  const [totals, setTotals] = useState({ sold: 0, revenueRp: 0, downloads: 0 })
  const [loading, setLoading] = useState(true)

  // Drill-down pembeli.
  const [buyersFor, setBuyersFor] = useState<EbookStatsItem | null>(null)
  const [buyers, setBuyers] = useState<BuyerItem[]>([])
  const [buyersLoading, setBuyersLoading] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ebooks/stats')
      const json = await res.json()
      if (json.success) {
        setItems(json.data.items)
        setTotals(json.data.totals)
      } else {
        toast.error(json.error ?? 'Gagal memuat data')
      }
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  async function openBuyers(ebook: EbookStatsItem) {
    setBuyersFor(ebook)
    setBuyersLoading(true)
    try {
      const res = await fetch(`/api/ebooks/${ebook.id}/buyers`)
      const json = await res.json()
      if (json.success) setBuyers(json.data.items)
      else toast.error(json.error ?? 'Gagal memuat pembeli')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setBuyersLoading(false)
    }
  }

  async function buyerAction(
    entitlementId: string,
    action: 'REVOKE' | 'RESTORE' | 'RESEND_LINK',
  ) {
    if (!buyersFor) return
    setActingId(entitlementId)
    try {
      const res = await fetch(`/api/ebooks/${buyersFor.id}/buyers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entitlementId, action }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error ?? 'Aksi gagal')
        return
      }
      toast.success(
        action === 'REVOKE'
          ? 'Akses dicabut'
          : action === 'RESTORE'
            ? 'Akses diaktifkan lagi'
            : 'Link akses dikirim ulang',
      )
      await openBuyers(buyersFor)
      void loadStats()
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={BookOpen}
        title="E-Book"
        description="Penjualan & akses pembeli e-book. Upload/edit e-book dari dialog produk di halaman Produk."
        actions={
          <Button variant="outline" size="sm" onClick={() => void loadStats()}>
            <RefreshCcw className="mr-1.5 size-3.5" />
            Refresh
          </Button>
        }
      />

      {/* Stats strip total */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-warm-500 text-xs">Terjual</p>
            <p className="text-warm-900 text-xl font-semibold">{totals.sold}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-warm-500 text-xs">Omzet</p>
            <p className="text-warm-900 text-xl font-semibold">
              Rp {formatNumber(totals.revenueRp)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-warm-500 text-xs">Download</p>
            <p className="text-warm-900 text-xl font-semibold">
              {totals.downloads}
            </p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="text-warm-500 flex items-center justify-center py-16">
          <Loader2 className="mr-2 size-5 animate-spin" /> Memuat…
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={BookOpen}
              title="Belum ada e-book"
              description="Buka halaman Produk → tambah/edit produk → bagian E-Book untuk upload PDF/EPUB pertama kamu."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((e) => (
            <Card key={e.id} className={e.isActive ? '' : 'opacity-60'}>
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                {e.coverUrl ? (
                  <img
                    src={e.coverUrl}
                    alt={e.title}
                    className="size-14 rounded-lg object-cover"
                  />
                ) : (
                  <div className="bg-warm-100 flex size-14 items-center justify-center rounded-lg">
                    <BookOpen className="text-warm-400 size-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-warm-900 font-semibold">{e.title}</p>
                    {!e.isActive && <Badge variant="secondary">Off</Badge>}
                    <Badge variant="secondary">
                      {e.fileFormat} · {formatSize(e.fileSizeBytes)}
                    </Badge>
                  </div>
                  <p className="text-warm-500 mt-0.5 text-xs">
                    {e.product
                      ? `Produk: ${e.product.name} (Rp ${formatNumber(e.product.price)})`
                      : 'Belum terhubung ke produk'}
                    {' · '}
                    {e.accessDays
                      ? `akses ${e.accessDays} hari`
                      : 'akses selamanya'}
                    {' · '}maks {e.maxDownloads}x download
                  </p>
                </div>
                <div className="flex items-center gap-4 text-center text-sm">
                  <div>
                    <p className="text-warm-900 font-semibold">{e.stats.sold}</p>
                    <p className="text-warm-500 text-xs">Terjual</p>
                  </div>
                  <div>
                    <p className="text-warm-900 font-semibold">
                      Rp {formatNumber(e.stats.revenueRp)}
                    </p>
                    <p className="text-warm-500 text-xs">Omzet</p>
                  </div>
                  <div>
                    <p className="text-warm-900 font-semibold">
                      {e.stats.downloads}
                    </p>
                    <p className="text-warm-500 text-xs">Download</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void openBuyers(e)}
                >
                  <Users className="mr-1.5 size-3.5" />
                  Pembeli ({e.stats.buyers})
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog pembeli per e-book */}
      <Dialog
        open={buyersFor !== null}
        onOpenChange={(open) => {
          if (!open) setBuyersFor(null)
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pembeli — {buyersFor?.title}</DialogTitle>
          </DialogHeader>
          {buyersLoading ? (
            <div className="text-warm-500 flex items-center justify-center py-10">
              <Loader2 className="mr-2 size-5 animate-spin" /> Memuat…
            </div>
          ) : buyers.length === 0 ? (
            <p className="text-warm-500 py-8 text-center text-sm">
              Belum ada pembeli.
            </p>
          ) : (
            <div className="space-y-2">
              {buyers.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-warm-900 font-medium">
                        {b.buyerName ?? b.buyerPhone}
                      </p>
                      <StatusBadge
                        tone={ACCESS_STATUS_META[b.status]?.tone ?? 'neutral'}
                        label={
                          b.status === 'ACTIVE'
                            ? 'Aktif'
                            : b.status === 'REVOKED'
                              ? 'Dicabut'
                              : 'Kedaluwarsa'
                        }
                      />
                    </div>
                    <p className="text-warm-500 mt-0.5 text-xs">
                      <span className="font-mono">{b.buyerPhone}</span>
                      {b.invoiceNumber && ` · ${b.invoiceNumber}`}
                      {b.purchaseCount > 1
                        ? ` · beli ${b.purchaseCount}× (total Rp ${formatNumber(b.totalPaidRp)})`
                        : b.pricePaidRp != null
                          ? ` · Rp ${formatNumber(b.pricePaidRp)}`
                          : ''}
                    </p>
                    <p className="text-warm-500 mt-0.5 flex items-center gap-1 text-xs">
                      <Download className="size-3" />
                      {b.downloadCount}/{b.maxDownloads}
                      {' · '}dibeli {formatDate(b.grantedAt)}
                      {b.expiresAt && ` · s.d. ${formatDate(b.expiresAt)}`}
                      {!b.accessNotifiedAt && b.status === 'ACTIVE' && (
                        <span className={TONES.warning.text}>
                          {' '}
                          · link belum terkirim
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actingId === b.id || b.status !== 'ACTIVE'}
                      onClick={() => void buyerAction(b.id, 'RESEND_LINK')}
                      title="Kirim ulang link akses via WA/email"
                    >
                      <Send className="size-3.5" />
                    </Button>
                    {b.status === 'ACTIVE' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn('hover:opacity-80', TONES.danger.text)}
                        disabled={actingId === b.id}
                        onClick={() => void buyerAction(b.id, 'REVOKE')}
                        title="Cabut akses"
                      >
                        <ShieldOff className="size-3.5" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actingId === b.id}
                        onClick={() => void buyerAction(b.id, 'RESTORE')}
                        title="Aktifkan lagi akses"
                      >
                        <RefreshCcw className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
