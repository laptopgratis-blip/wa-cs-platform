'use client'

// Dashboard testimoni owner (/pesanan/testimoni). List + kurasi (approve) +
// hapus. Data dari /api/reviews. POWER only (gating di page).
import { Check, Star, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Review {
  id: string
  customerName: string
  customerPhone: string
  productName: string | null
  rating: number
  reviewText: string | null
  photoUrls: string[]
  triedProduct: boolean
  approved: boolean
  createdAt: string
}

interface Stats {
  total: number
  approved: number
  avgRating: number
}

type Filter = 'all' | 'pending' | 'approved'

export function TestimoniClient() {
  const [filter, setFilter] = useState<Filter>('all')
  const [items, setItems] = useState<Review[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Review | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reviews?filter=${filter}`, {
        cache: 'no-store',
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { items: Review[]; stats: Stats }
      }
      if (json.success && json.data) {
        setItems(json.data.items)
        setStats(json.data.stats)
      }
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleApprove(r: Review) {
    setActionId(r.id)
    try {
      await fetch(`/api/reviews/${r.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approved: !r.approved }),
      })
      await load()
    } finally {
      setActionId(null)
    }
  }

  async function remove() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await fetch(`/api/reviews/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      await load()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Testimoni"
        description="Testimoni masuk otomatis dari link follow-up setelah customer terima pesanan. Setujui yang mau dipakai sebagai social proof."
      />

      {stats ? (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total" value={String(stats.total)} />
          <StatCard
            label="Rata-rata"
            value={stats.avgRating ? `${stats.avgRating} ★` : '—'}
          />
          <StatCard label="Disetujui" value={String(stats.approved)} />
        </div>
      ) : null}

      <div className="flex gap-2">
        {(['all', 'pending', 'approved'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium transition',
              filter === f
                ? 'bg-primary-500 text-white'
                : 'bg-warm-100 text-warm-600 hover:bg-warm-200',
            )}
          >
            {f === 'all'
              ? 'Semua'
              : f === 'pending'
                ? 'Belum disetujui'
                : 'Disetujui'}
          </button>
        ))}
      </div>

      {loading ? (
        <CardGridSkeleton count={4} />
      ) : items.length === 0 ? (
        <EmptyState
          bordered
          icon={Star}
          title="Belum ada testimoni"
          description="Testimoni terkumpul otomatis saat customer isi link review dari pesan follow-up."
        />
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{r.customerName}</span>
                      {r.approved ? (
                        <StatusBadge tone="success" label="Disetujui" />
                      ) : null}
                      {!r.triedProduct ? (
                        <StatusBadge tone="warning" label="Belum dicoba" />
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={cn(
                            'size-4',
                            r.rating >= n
                              ? 'fill-primary-400 text-primary-400'
                              : 'text-warm-300',
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {new Date(r.createdAt).toLocaleDateString('id-ID')}
                  </span>
                </div>

                {r.productName ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Produk: {r.productName}
                  </p>
                ) : null}
                {r.reviewText ? (
                  <p className="text-warm-700 mt-2 text-sm">{r.reviewText}</p>
                ) : null}

                {r.photoUrls.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.photoUrls.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={url}
                        src={url}
                        alt="Foto testimoni"
                        className="size-20 rounded-lg object-cover"
                      />
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant={r.approved ? 'outline' : 'default'}
                    disabled={actionId === r.id}
                    onClick={() => toggleApprove(r)}
                  >
                    <Check className="mr-1 size-3.5" />
                    {r.approved ? 'Batalkan' : 'Setujui'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={actionId === r.id}
                    onClick={() => setDeleteTarget(r)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-1 size-3.5" /> Hapus
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
        title={`Hapus testimoni dari ${deleteTarget?.customerName ?? 'customer'}?`}
        description="Testimoni yang dihapus tidak bisa dikembalikan."
        isLoading={isDeleting}
        onConfirm={remove}
      />
    </PageContainer>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <div className="text-lg font-semibold">{value}</div>
        <div className="text-muted-foreground text-xs">{label}</div>
      </CardContent>
    </Card>
  )
}
