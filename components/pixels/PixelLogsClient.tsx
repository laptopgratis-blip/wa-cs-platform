'use client'

// Pixel Event Logs viewer — tabel paginated dengan filter platform/event/
// status/pixel. Click row → modal detail payload+response.
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Filter, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatRelativeTime } from '@/lib/format-time'

interface LogItem {
  id: string
  pixelId: string | null
  orderId: string | null
  platform: string
  eventName: string
  eventId: string
  source: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
  responseStatus: number | null
  responseBody: string | null
  errorMessage: string | null
  retryCount: number
  succeeded: boolean
  createdAt: string
}

interface PixelLite {
  id: string
  displayName: string
  platform: string
}

interface PixelLogsClientProps {
  pixels: PixelLite[]
}

const PLATFORM_EMOJI: Record<string, string> = {
  META: '📘',
  GOOGLE_ADS: '🎯',
  GA4: '📊',
  TIKTOK: '🎵',
}

const EVENT_OPTIONS = [
  'Purchase',
  'Lead',
  'AddPaymentInfo',
  'InitiateCheckout',
  'AddToCart',
  'ViewContent',
  'PageView',
]

export function PixelLogsClient({ pixels }: PixelLogsClientProps) {
  const [items, setItems] = useState<LogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const [platform, setPlatform] = useState<string>('')
  const [eventName, setEventName] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [pixelId, setPixelId] = useState<string>('')
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')

  const [detail, setDetail] = useState<LogItem | null>(null)

  async function fetchLogs() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      if (platform) params.set('platform', platform)
      if (eventName) params.set('eventName', eventName)
      if (status) params.set('status', status)
      if (pixelId) params.set('pixelId', pixelId)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`/api/integrations/pixels/logs?${params}`)
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal memuat logs')
        return
      }
      setItems(data.data.items)
      setTotal(data.data.pagination.total)
      setTotalPages(data.data.pagination.totalPages)
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, platform, eventName, status, pixelId, from, to])

  function resetFilters() {
    setPlatform('')
    setEventName('')
    setStatus('')
    setPixelId('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 md:py-8">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/integrations/pixels">
            <ArrowLeft className="mr-1 size-4" />
            Kembali
          </Link>
        </Button>
        <div>
          <h1 className="font-display text-xl font-bold text-warm-900 md:text-2xl">
            Pixel Event Logs
          </h1>
          <p className="text-sm text-warm-600">
            Audit trail semua event yang di-fire (browser & server). Total{' '}
            {total.toLocaleString('id-ID')} event.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="mb-4">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-warm-500" />
            <p className="text-sm font-medium text-warm-700">Filter</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="ml-auto h-7 text-xs"
            >
              Reset
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1">
              <Label className="text-xs">Platform</Label>
              <Select
                value={platform || 'all'}
                onValueChange={(v) => {
                  setPlatform(v === 'all' ? '' : v)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="META">Meta</SelectItem>
                  <SelectItem value="GOOGLE_ADS">Google Ads</SelectItem>
                  <SelectItem value="GA4">GA4</SelectItem>
                  <SelectItem value="TIKTOK">TikTok</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Event</Label>
              <Select
                value={eventName || 'all'}
                onValueChange={(v) => {
                  setEventName(v === 'all' ? '' : v)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  {EVENT_OPTIONS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={status || 'all'}
                onValueChange={(v) => {
                  setStatus(v === 'all' ? '' : v)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="succeeded">✅ Sukses</SelectItem>
                  <SelectItem value="failed">❌ Gagal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pixel</Label>
              <Select
                value={pixelId || 'all'}
                onValueChange={(v) => {
                  setPixelId(v === 'all' ? '' : v)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  {pixels.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {PLATFORM_EMOJI[p.platform] ?? '📊'} {p.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dari</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value)
                  setPage(1)
                }}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sampai</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value)
                  setPage(1)
                }}
                className="h-9 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-warm-500">
              Memuat…
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-warm-500">
              Tidak ada event yang cocok dengan filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-warm-50 text-xs uppercase tracking-wider text-warm-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Waktu</th>
                    <th className="px-3 py-2 text-left">Platform</th>
                    <th className="px-3 py-2 text-left">Event</th>
                    <th className="px-3 py-2 text-left">Source</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Order</th>
                    <th className="px-3 py-2 text-right">Retry</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setDetail(log)}
                      className="cursor-pointer border-b hover:bg-warm-50"
                    >
                      <td className="px-3 py-2 text-xs text-warm-600">
                        {formatRelativeTime(log.createdAt)}
                      </td>
                      <td className="px-3 py-2">
                        {PLATFORM_EMOJI[log.platform] ?? '📊'}{' '}
                        <span className="font-mono text-xs">{log.platform}</span>
                      </td>
                      <td className="px-3 py-2 font-medium">{log.eventName}</td>
                      <td className="px-3 py-2 text-xs text-warm-600">
                        {log.source}
                      </td>
                      <td className="px-3 py-2">
                        {log.succeeded ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                            <CheckCircle2 className="mr-1 size-3" />
                            Sukses
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">
                            <XCircle className="mr-1 size-3" />
                            Gagal
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {log.orderId ? (
                          <span className="text-warm-600">
                            {log.orderId.slice(0, 8)}…
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-warm-500">
                        {log.retryCount > 0 ? `×${log.retryCount}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm text-warm-600">
            Hal {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detail?.platform} · {detail?.eventName}
            </DialogTitle>
          </DialogHeader>

          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <Label className="text-xs text-warm-500">Event ID</Label>
                  <p className="font-mono break-all">{detail.eventId}</p>
                </div>
                <div>
                  <Label className="text-xs text-warm-500">Order ID</Label>
                  <p className="font-mono break-all">
                    {detail.orderId ?? '—'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-warm-500">Source</Label>
                  <p>{detail.source}</p>
                </div>
                <div>
                  <Label className="text-xs text-warm-500">Status</Label>
                  <p>
                    {detail.succeeded ? '✅ Sukses' : '❌ Gagal'}
                    {detail.retryCount > 0 && ` (retry ×${detail.retryCount})`}
                  </p>
                </div>
                {detail.responseStatus != null && (
                  <div>
                    <Label className="text-xs text-warm-500">HTTP Status</Label>
                    <p className="font-mono">{detail.responseStatus}</p>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-warm-500">Waktu</Label>
                  <p>{new Date(detail.createdAt).toLocaleString('id-ID')}</p>
                </div>
              </div>

              {detail.errorMessage && (
                <div>
                  <Label className="text-xs text-warm-500">Error</Label>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-rose-50 p-2 font-mono text-xs text-rose-900">
                    {detail.errorMessage}
                  </pre>
                </div>
              )}

              <div>
                <Label className="text-xs text-warm-500">Payload (sent)</Label>
                <pre className="mt-1 max-h-60 overflow-auto rounded bg-warm-50 p-2 font-mono text-xs">
                  {JSON.stringify(detail.payload, null, 2)}
                </pre>
              </div>

              {detail.responseBody && (
                <div>
                  <Label className="text-xs text-warm-500">Response</Label>
                  <pre className="mt-1 max-h-60 overflow-auto rounded bg-warm-50 p-2 font-mono text-xs">
                    {detail.responseBody}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
