'use client'

// Pixel Event Logs viewer — tabel paginated dengan filter platform/event/
// status/pixel. Click row → modal detail payload+response.
import { ArrowLeft, CheckCircle2, Filter, Loader2, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/shared/EmptyState'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { StatusBadge } from '@/components/shared/StatusBadge'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatRelativeTime } from '@/lib/format-time'
import { TONES } from '@/lib/ui-tones'

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
  // pageSize ikut `limit` dari respons API (default server = 50) supaya teks
  // "Menampilkan x–y dari N" di <Pagination> selalu sinkron dengan backend.
  const [pageSize, setPageSize] = useState(50)
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
      setPageSize(data.data.pagination.limit ?? 50)
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
    <PageContainer>
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/integrations/pixels">
            <ArrowLeft className="mr-1 size-4" />
            Kembali
          </Link>
        </Button>
        <PageHeader
          title="Pixel Event Logs"
          description={`Audit trail semua event yang di-fire (browser & server). Total ${total.toLocaleString('id-ID')} event.`}
        />
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Filter className="text-warm-500 size-4" />
            <p className="text-warm-700 text-sm font-medium">Filter</p>
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
                      {p.platform} · {p.displayName}
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
            <div className="text-warm-500 flex items-center justify-center gap-2 p-8 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Memuat…
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Filter}
              title="Tidak ada event"
              description="Tidak ada event yang cocok dengan filter."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Retry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((log) => (
                  <TableRow
                    key={log.id}
                    onClick={() => setDetail(log)}
                    className="cursor-pointer"
                  >
                    <TableCell className="text-warm-600 text-xs">
                      {formatRelativeTime(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{log.platform}</span>
                    </TableCell>
                    <TableCell className="font-medium">
                      {log.eventName}
                    </TableCell>
                    <TableCell className="text-warm-600 text-xs">
                      {log.source}
                    </TableCell>
                    <TableCell>
                      {log.succeeded ? (
                        <StatusBadge
                          tone="success"
                          icon={CheckCircle2}
                          label="Sukses"
                        />
                      ) : (
                        <StatusBadge
                          tone="danger"
                          icon={XCircle}
                          label="Gagal"
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.orderId ? (
                        <span className="text-warm-600">
                          {log.orderId.slice(0, 8)}…
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-warm-500 text-right text-xs">
                      {log.retryCount > 0 ? `×${log.retryCount}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          isLoading={loading}
          onPageChange={setPage}
          noun="event"
        />
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
                  <Label className="text-warm-500 text-xs">Event ID</Label>
                  <p className="font-mono break-all">{detail.eventId}</p>
                </div>
                <div>
                  <Label className="text-warm-500 text-xs">Order ID</Label>
                  <p className="font-mono break-all">{detail.orderId ?? '—'}</p>
                </div>
                <div>
                  <Label className="text-warm-500 text-xs">Source</Label>
                  <p>{detail.source}</p>
                </div>
                <div>
                  <Label className="text-warm-500 text-xs">Status</Label>
                  <p className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge
                      tone={detail.succeeded ? 'success' : 'danger'}
                      icon={detail.succeeded ? CheckCircle2 : XCircle}
                      label={detail.succeeded ? 'Sukses' : 'Gagal'}
                    />
                    {detail.retryCount > 0 && `(retry ×${detail.retryCount})`}
                  </p>
                </div>
                {detail.responseStatus != null && (
                  <div>
                    <Label className="text-warm-500 text-xs">HTTP Status</Label>
                    <p className="font-mono">{detail.responseStatus}</p>
                  </div>
                )}
                <div>
                  <Label className="text-warm-500 text-xs">Waktu</Label>
                  <p>{new Date(detail.createdAt).toLocaleString('id-ID')}</p>
                </div>
              </div>

              {detail.errorMessage && (
                <div>
                  <Label className="text-warm-500 text-xs">Error</Label>
                  <pre
                    className={`mt-1 max-h-40 overflow-auto rounded p-2 font-mono text-xs ${TONES.danger.bg} ${TONES.danger.text}`}
                  >
                    {detail.errorMessage}
                  </pre>
                </div>
              )}

              <div>
                <Label className="text-warm-500 text-xs">Payload (sent)</Label>
                <pre className="bg-warm-50 mt-1 max-h-60 overflow-auto rounded p-2 font-mono text-xs">
                  {JSON.stringify(detail.payload, null, 2)}
                </pre>
              </div>

              {detail.responseBody && (
                <div>
                  <Label className="text-warm-500 text-xs">Response</Label>
                  <pre className="bg-warm-50 mt-1 max-h-60 overflow-auto rounded p-2 font-mono text-xs">
                    {detail.responseBody}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
