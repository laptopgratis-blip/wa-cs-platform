'use client'

// Daftar mutasi bank user. Filter by action & type. Klik MULTIPLE_MATCH atau
// NO_MATCH (CR) → modal manual resolve: pilih order target atau IGNORE.
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatRelativeTime } from '@/lib/format-time'
import { formatRupiah } from '@/lib/format'

interface MatchedOrder {
  id: string
  invoiceNumber: string | null
  customerName: string
  totalRp: number
  paymentStatus: string
}

interface MutationItem {
  id: string
  bankCode: string
  accountNumber: string
  mutationDate: string
  mutationType: 'CR' | 'DB'
  amount: number
  description: string
  branch: string | null
  balance: number | null
  matchedOrderId: string | null
  matchAction: string | null
  matchScore: number | null
  matchedOrder: MatchedOrder | null
  createdAt: string
}

interface OrderCandidate {
  id: string
  invoiceNumber: string | null
  customerName: string
  totalRp: number
  createdAt: string
}

const ACTION_FILTERS = [
  { value: 'ALL', label: 'Semua' },
  { value: 'AUTO_CONFIRMED', label: 'Auto-confirmed' },
  { value: 'MULTIPLE_MATCH', label: 'Multiple match' },
  { value: 'NO_MATCH', label: 'No match' },
  { value: 'IGNORED', label: 'Ignored' },
  { value: 'MANUAL_RESOLVED', label: 'Manual resolved' },
] as const

const TYPE_FILTERS = [
  { value: 'ALL', label: 'Semua' },
  { value: 'CR', label: 'CR (masuk)' },
  { value: 'DB', label: 'DB (keluar)' },
] as const

function actionBadge(action: string | null) {
  if (!action) return <Badge variant="outline">—</Badge>
  switch (action) {
    case 'AUTO_CONFIRMED':
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-700">
          ✅ Auto-confirmed
        </Badge>
      )
    case 'MULTIPLE_MATCH':
      return <Badge variant="destructive">🟡 Multiple match</Badge>
    case 'NO_MATCH':
      return <Badge variant="outline">— No match</Badge>
    case 'IGNORED':
      return <Badge variant="outline">🚫 Ignored</Badge>
    case 'MANUAL_RESOLVED':
      return (
        <Badge variant="outline" className="border-emerald-400 text-emerald-700">
          ✅ Manual resolved
        </Badge>
      )
    default:
      return <Badge variant="outline">{action}</Badge>
  }
}

export function MutationsClient() {
  const [items, setItems] = useState<MutationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [actionFilter, setActionFilter] = useState<string>('ALL')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [resolveTarget, setResolveTarget] = useState<MutationItem | null>(null)
  const [candidates, setCandidates] = useState<OrderCandidate[]>([])
  const [resolveLoading, setResolveLoading] = useState(false)

  const pageSize = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      if (actionFilter !== 'ALL') params.set('action', actionFilter)
      if (typeFilter !== 'ALL') params.set('type', typeFilter)
      const res = await fetch(
        '/api/integrations/bank-mutation/mutations?' + params.toString(),
      )
      const j = await res.json()
      if (j.success) {
        setItems(j.data.items)
        setTotal(j.data.total)
      } else {
        toast.error(j.error || 'Gagal load')
      }
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter, typeFilter])

  useEffect(() => {
    load()
  }, [load])

  async function openResolve(mutation: MutationItem) {
    setResolveTarget(mutation)
    setResolveLoading(true)
    try {
      // Cari order PENDING dengan totalRp == amount mutasi.
      const res = await fetch(
        `/api/orders?paymentStatus=PENDING&paymentMethod=TRANSFER&totalRp=${mutation.amount}`,
      )
      const j = await res.json()
      if (j.success) {
        setCandidates(
          (j.data.items || j.data.orders || []).map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (o: any) => ({
              id: o.id,
              invoiceNumber: o.invoiceNumber,
              customerName: o.customerName,
              totalRp: o.totalRp,
              createdAt: o.createdAt,
            }),
          ),
        )
      } else {
        setCandidates([])
      }
    } finally {
      setResolveLoading(false)
    }
  }

  async function submitResolve(orderId: string | null) {
    if (!resolveTarget) return
    const res = await fetch(
      `/api/integrations/bank-mutation/mutations/${resolveTarget.id}/manual-match`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      },
    )
    const j = await res.json()
    if (!res.ok || !j.success) {
      toast.error(j.error || 'Gagal resolve')
      return
    }
    toast.success(orderId ? 'Order ter-konfirmasi' : 'Mutasi di-ignore')
    setResolveTarget(null)
    setCandidates([])
    load()
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/integrations/bank-mutation">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Kembali
          </Button>
        </Link>
        <h1 className="text-xl font-bold">Mutasi Bank</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={actionFilter} onValueChange={(v) => { setPage(1); setActionFilter(v) }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setPage(1); setTypeFilter(v) }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin inline mr-2" />
              Memuat...
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              Belum ada mutasi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3 font-medium">Tanggal</th>
                    <th className="p-3 font-medium">Deskripsi</th>
                    <th className="p-3 font-medium text-right">Jumlah</th>
                    <th className="p-3 font-medium">Tipe</th>
                    <th className="p-3 font-medium">Match</th>
                    <th className="p-3 font-medium">Order</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((m) => (
                    <tr key={m.id} className="border-b hover:bg-muted/20">
                      <td className="p-3 whitespace-nowrap">
                        {new Date(m.mutationDate).toLocaleDateString('id-ID')}
                      </td>
                      <td className="p-3 max-w-[280px] truncate" title={m.description}>
                        {m.description}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {formatRupiah(m.amount)}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={m.mutationType === 'CR' ? 'default' : 'outline'}
                          className={m.mutationType === 'CR' ? 'bg-emerald-600' : ''}
                        >
                          {m.mutationType}
                        </Badge>
                      </td>
                      <td className="p-3">{actionBadge(m.matchAction)}</td>
                      <td className="p-3">
                        {m.matchedOrder ? (
                          <Link
                            href={`/pesanan/${m.matchedOrder.id}`}
                            className="text-emerald-700 hover:underline font-mono text-xs"
                          >
                            {m.matchedOrder.invoiceNumber || m.matchedOrder.id.slice(-8)}
                          </Link>
                        ) : m.mutationType === 'CR' &&
                          (m.matchAction === 'MULTIPLE_MATCH' ||
                            m.matchAction === 'NO_MATCH') ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openResolve(m)}
                          >
                            Resolve
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Halaman {page} dari {totalPages} · {total} total
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog
        open={!!resolveTarget}
        onOpenChange={(o) => {
          if (!o) {
            setResolveTarget(null)
            setCandidates([])
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Mutasi Manual</DialogTitle>
            <DialogDescription>
              {resolveTarget && (
                <>
                  {new Date(resolveTarget.mutationDate).toLocaleDateString('id-ID')}
                  {' — '}
                  <span className="font-mono">
                    {formatRupiah(resolveTarget.amount)}
                  </span>
                  <br />
                  <span className="text-xs">{resolveTarget.description}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {resolveLoading ? (
            <div className="text-center py-6">
              <Loader2 className="h-5 w-5 animate-spin inline" />
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tidak ada order PENDING dengan total yang cocok.
            </p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => submitResolve(c.id)}
                  className="w-full text-left p-3 border rounded hover:bg-muted/40 flex justify-between items-center"
                >
                  <div>
                    <div className="font-mono text-xs">
                      {c.invoiceNumber || c.id.slice(-8)}
                    </div>
                    <div className="text-sm">{c.customerName}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatRelativeTime(c.createdAt)}
                    </div>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => submitResolve(null)}>
              Mark Ignored
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setResolveTarget(null)
                setCandidates([])
              }}
            >
              Batal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
