'use client'

// Admin: harga Kredit Pesan WA per kategori template Meta (Rp/pesan, sudah
// termasuk margin) + ringkasan ledger 30 hari. Harga ini yang dipotong dari
// dompet Kredit Pesan user tiap pesan template Cloud API di luar window.
import { Loader2, MessageCircle, Save } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatRupiah } from '@/lib/format'

type Category = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'

interface RateRow {
  category: Category
  priceRp: number
  metaRp: number | null
  updatedAt: string | null
  seeded: boolean
}

interface UsageRow {
  type: string
  category: Category | null
  amountRp: number
  count: number
}

interface Payload {
  rates: RateRow[]
  usage30d: UsageRow[]
  totals: { outstandingRp: number; purchasedRp: number; usedRp: number }
}

const CATEGORY_LABEL: Record<Category, { title: string; hint: string }> = {
  UTILITY: {
    title: 'Utility',
    hint: 'Konfirmasi order, resi, pengingat bayar, notifikasi akun. Gratis bila dikirim dalam window 24 jam.',
  },
  MARKETING: {
    title: 'Marketing',
    hint: 'Promo, broadcast penawaran, nurture lead. Selalu berbayar; kontak bisa opt-out.',
  },
  AUTHENTICATION: {
    title: 'Authentication',
    hint: 'Kode OTP. Selalu berbayar (sesi admin/platform tidak ditagih).',
  },
}

const TX_LABEL: Record<string, string> = {
  PURCHASE: 'Top-up',
  USAGE: 'Pemakaian',
  REFUND: 'Refund',
  ADJUSTMENT: 'Koreksi',
  BONUS: 'Bonus',
}

export function MessageCreditRatesManager() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<Category, { priceRp: string; metaRp: string }>>({
    UTILITY: { priceRp: '', metaRp: '' },
    MARKETING: { priceRp: '', metaRp: '' },
    AUTHENTICATION: { priceRp: '', metaRp: '' },
  })
  const [saving, setSaving] = useState<Category | null>(null)

  const load = useCallback(async () => {
    // Tidak setLoading(true) sinkron di sini (react-hooks/set-state-in-effect);
    // state awal sudah loading=true, refresh berikutnya cukup ganti data.
    try {
      const res = await fetch('/api/admin/message-credit-rates')
      const json = (await res.json()) as { success: boolean; data?: Payload; error?: string }
      if (!json.success || !json.data) {
        toast.error(json.error ?? 'Gagal memuat')
        return
      }
      setData(json.data)
      const next = { ...drafts }
      for (const r of json.data.rates) {
        next[r.category] = { priceRp: String(r.priceRp), metaRp: r.metaRp === null ? '' : String(r.metaRp) }
      }
      setDrafts(next)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save(category: Category) {
    const d = drafts[category]
    const priceRp = Number(d.priceRp)
    if (!Number.isInteger(priceRp) || priceRp < 0) {
      toast.error('Harga harus bilangan bulat ≥ 0')
      return
    }
    setSaving(category)
    try {
      const res = await fetch('/api/admin/message-credit-rates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          priceRp,
          metaRp: d.metaRp.trim() === '' ? null : Number(d.metaRp),
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error ?? 'Gagal menyimpan')
        return
      }
      toast.success(`Harga ${CATEGORY_LABEL[category].title} disimpan`)
      void load()
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MessageCircle}
        title="Kredit Pesan WA"
        description="Harga per pesan template Meta (Cloud API) yang dipotong dari dompet Kredit Pesan user. Sesuai dokumen pricing: Marketing Rp657 · Utility Rp393 · Authentication Rp393 (markup ±10–12% di atas dasar Meta)."
      />

      {loading && !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </div>
      ) : null}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Saldo beredar (semua user)</CardDescription>
                <CardTitle className="text-xl">{formatRupiah(data.totals.outstandingRp)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total top-up</CardDescription>
                <CardTitle className="text-xl">{formatRupiah(data.totals.purchasedRp)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total terpakai</CardDescription>
                <CardTitle className="text-xl">{formatRupiah(data.totals.usedRp)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {data.rates.map((r) => (
              <Card key={r.category}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    {CATEGORY_LABEL[r.category].title}
                    {r.seeded && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        default
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs">{CATEGORY_LABEL[r.category].hint}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`price-${r.category}`}>Harga (Rp / pesan)</Label>
                    <Input
                      id={`price-${r.category}`}
                      type="number"
                      min={0}
                      value={drafts[r.category].priceRp}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [r.category]: { ...d[r.category], priceRp: e.target.value } }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`meta-${r.category}`}>Harga dasar Meta (Rp, info)</Label>
                    <Input
                      id={`meta-${r.category}`}
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="mis. 586.33"
                      value={drafts[r.category].metaRp}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [r.category]: { ...d[r.category], metaRp: e.target.value } }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {r.updatedAt ? `Diubah ${new Date(r.updatedAt).toLocaleString('id-ID')}` : 'Belum pernah diubah'}
                    </span>
                    <Button size="sm" onClick={() => save(r.category)} disabled={saving === r.category}>
                      {saving === r.category ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Save className="mr-1 size-3.5" />}
                      Simpan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pemakaian 30 hari terakhir</CardTitle>
              <CardDescription>Ringkasan ledger MessageCreditTransaction per jenis & kategori.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.usage30d.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada transaksi.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1.5">Jenis</th>
                        <th className="py-1.5">Kategori</th>
                        <th className="py-1.5 text-right">Jumlah tx</th>
                        <th className="py-1.5 text-right">Total (Rp)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.usage30d.map((u, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-1.5">{TX_LABEL[u.type] ?? u.type}</td>
                          <td className="py-1.5">{u.category ? CATEGORY_LABEL[u.category].title : '—'}</td>
                          <td className="py-1.5 text-right tabular-nums">{u.count}</td>
                          <td className="py-1.5 text-right tabular-nums">{formatRupiah(u.amountRp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
