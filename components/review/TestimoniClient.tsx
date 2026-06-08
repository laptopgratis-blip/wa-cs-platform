'use client'

// Dashboard testimoni owner (/pesanan/testimoni). List + kurasi (approve) +
// hapus. Data dari /api/reviews. POWER only (gating di page).
import { Check, Loader2, Star, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

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

  async function remove(r: Review) {
    if (!confirm('Hapus testimoni ini?')) return
    setActionId(r.id)
    try {
      await fetch(`/api/reviews/${r.id}`, { method: 'DELETE' })
      await load()
    } finally {
      setActionId(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Testimoni</h1>
        <p className="text-sm text-muted-foreground">
          Testimoni masuk otomatis dari link follow-up setelah customer terima
          pesanan. Setujui yang mau dipakai sebagai social proof.
        </p>
      </div>

      {stats ? (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <StatCard label="Total" value={String(stats.total)} />
          <StatCard
            label="Rata-rata"
            value={stats.avgRating ? `${stats.avgRating} ★` : '—'}
          />
          <StatCard label="Disetujui" value={String(stats.approved)} />
        </div>
      ) : null}

      <div className="mb-4 flex gap-2">
        {(['all', 'pending', 'approved'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              filter === f
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {f === 'all' ? 'Semua' : f === 'pending' ? 'Belum disetujui' : 'Disetujui'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          Belum ada testimoni.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{r.customerName}</span>
                    {r.approved ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        Disetujui
                      </span>
                    ) : null}
                    {!r.triedProduct ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        Belum dicoba
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`h-4 w-4 ${
                          r.rating >= n
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-zinc-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString('id-ID')}
                </span>
              </div>

              {r.productName ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Produk: {r.productName}
                </p>
              ) : null}
              {r.reviewText ? (
                <p className="mt-2 text-sm text-zinc-700">{r.reviewText}</p>
              ) : null}

              {r.photoUrls.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.photoUrls.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt="Foto testimoni"
                      className="h-20 w-20 rounded-lg object-cover"
                    />
                  ))}
                </div>
              ) : null}

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={actionId === r.id}
                  onClick={() => toggleApprove(r)}
                  className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                    r.approved
                      ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      : 'bg-emerald-500 text-white hover:bg-emerald-600'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                  {r.approved ? 'Batalkan' : 'Setujui'}
                </button>
                <button
                  type="button"
                  disabled={actionId === r.id}
                  onClick={() => remove(r)}
                  className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-3 text-center shadow-sm">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
