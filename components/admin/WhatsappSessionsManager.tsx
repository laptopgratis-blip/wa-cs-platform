'use client'

// List semua sesi WhatsApp lintas user (platform-wide), read-only.
// Status dibaca dari snapshot DB; tombol Refresh re-fetch manual (tanpa
// Socket.io). Struktur meniru UsersManager: debounce search + fetch dgn flag
// aborted + shadcn Table/Badge/Input/Select.
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { StatusBadge } from '@/components/whatsapp/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableSkeleton } from '@/components/shared/skeletons'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatNumber } from '@/lib/format'
import { formatRelativeTime } from '@/lib/format-time'
import type { WaStatus } from '@/lib/socket-client'

interface SessionRow {
  id: string
  phoneNumber: string | null
  displayName: string | null
  status: WaStatus
  isActive: boolean
  user: { id: string; email: string; name: string | null }
  soul: { id: string; name: string } | null
  model: {
    id: string
    name: string
    provider: 'ANTHROPIC' | 'OPENAI' | 'GOOGLE'
    costPerMessage: number
  } | null
  contactsCount: number
  messagesCount: number
  createdAt: string
  updatedAt: string
}

interface ApiData {
  page: number
  pageSize: number
  total: number
  sessions: SessionRow[]
}

const PAGE_SIZE = 20

// Urutan + label dropdown filter status.
const STATUS_OPTIONS: Array<{ value: WaStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Semua Status' },
  { value: 'CONNECTED', label: 'Terhubung' },
  { value: 'WAITING_QR', label: 'Menunggu QR' },
  { value: 'CONNECTING', label: 'Menghubungkan' },
  { value: 'DISCONNECTED', label: 'Terputus' },
  { value: 'PAUSED', label: 'Dijeda' },
  { value: 'ERROR', label: 'Error' },
]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function WhatsappSessionsManager() {
  const [rows, setRows] = useState<SessionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<WaStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [isLoading, setLoading] = useState(true)
  // Dibump tombol Refresh untuk memaksa re-fetch params yang sama.
  const [refreshKey, setRefreshKey] = useState(0)

  // Debounce input search; setState di dalam setTimeout (bukan sinkron).
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(id)
  }, [search])

  // Satu-satunya jalur fetch — re-run saat page/status/search/refresh berubah.
  useEffect(() => {
    let aborted = false
    setLoading(true)
    ;(async () => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(PAGE_SIZE))
      if (status !== 'all') params.set('status', status)
      if (debounced) params.set('search', debounced)
      try {
        const res = await fetch(`/api/admin/whatsapp-sessions?${params}`)
        const json = (await res.json()) as { success: boolean; data?: ApiData }
        if (aborted) return
        if (json.success && json.data) {
          setRows(json.data.sessions)
          setTotal(json.data.total)
        }
      } finally {
        if (!aborted) setLoading(false)
      }
    })()
    return () => {
      aborted = true
    }
  }, [page, status, debounced, refreshKey])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const fromRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const toRow = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="space-y-4">
      <PageHeader
        title="WhatsApp Sessions"
        description="Semua sesi WhatsApp lintas user — nomor, status, model AI, dan pemiliknya."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Cari sesi WhatsApp"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Cari nomor / email pemilik..."
            className="pl-8"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as WaStatus | 'all')
            setPage(1)
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={isLoading}
          className="ml-auto"
        >
          <RefreshCw
            className={`mr-2 size-4 ${isLoading ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nomor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Model AI</TableHead>
              <TableHead>Pemilik</TableHead>
              <TableHead>Soul</TableHead>
              <TableHead className="text-right">Kontak</TableHead>
              <TableHead className="text-right">Pesan</TableHead>
              <TableHead>Dibuat</TableHead>
              <TableHead>Diupdate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={5} cols={9} />
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <EmptyState
                    icon={Search}
                    title="Tidak ada sesi yang cocok"
                    description="Coba ubah kata kunci atau filter status."
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium tabular-nums">
                        {s.phoneNumber || s.displayName || '—'}
                      </span>
                      {!s.isActive && (
                        <Badge
                          variant="outline"
                          className="text-xs text-muted-foreground"
                        >
                          nonaktif
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                  </TableCell>
                  <TableCell>
                    {s.model ? (
                      <div>
                        <p className="text-sm">{s.model.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.model.provider}
                        </p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{s.user.name || '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.user.email}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {s.soul?.name ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(s.contactsCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(s.messagesCount)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(s.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelativeTime(s.updatedAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? 'Tidak ada sesi'
            : `Menampilkan ${fromRow}–${toRow} dari ${formatNumber(total)}`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-label="Halaman sebelumnya"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isLoading}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            aria-label="Halaman berikutnya"
            onClick={() => setPage((p) => p + 1)}
            disabled={page * PAGE_SIZE >= total || isLoading}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
