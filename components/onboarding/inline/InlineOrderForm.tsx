'use client'

// InlineOrderForm — bikin form order pertama langsung di wizard. Field
// minimal: nama form + opsi produk. Default lain (acceptCod, acceptTransfer,
// requireShipping, dll) pakai default dari orderFormCreateSchema. Setting
// lanjutan (pixel, social proof, custom shipping) di halaman lengkap.

import { CheckCircle2, Loader2, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { InlineTaskCommonProps } from './InlineTaskHost'

interface ProductLite {
  id: string
  name: string
  price: number
  isActive: boolean
}

export function InlineOrderForm({
  onCompleted,
  fallbackHref,
}: InlineTaskCommonProps) {
  const [name, setName] = useState('Form Pesanan Utama')
  const [products, setProducts] = useState<ProductLite[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/products', { cache: 'no-store' })
        const json = (await res.json()) as {
          success: boolean
          data?: { items: ProductLite[] }
        }
        if (cancelled) return
        if (res.ok && json.success && json.data) {
          const active = json.data.items.filter((p) => p.isActive)
          setProducts(active)
          // Default: semua produk aktif tampil di form (UX paling sederhana).
          setSelectedIds(active.map((p) => p.id))
        }
      } catch (err) {
        console.warn('[InlineOrderForm products]', err)
      } finally {
        if (!cancelled) setLoadingProducts(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function toggleProduct(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (name.trim().length < 1) {
      toast.error('Nama form wajib diisi')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/order-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          // Kosong = semua produk aktif tampil. Kalau user pilih subset,
          // kirim subset; kalau user pilih semua (= productIds.length ==
          // products.length), kirim [] supaya form auto-include produk baru
          // yang ditambah belakangan.
          productIds:
            selectedIds.length === products.length ? [] : selectedIds,
          acceptCod: true,
          acceptTransfer: true,
          requireShipping: true,
          isActive: true,
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal buat form order')
        setSubmitting(false)
        return
      }
      toast.success('Form order tersimpan')
      setDone(true)
      setTimeout(() => onCompleted(), 800)
    } catch (err) {
      console.error('[InlineOrderForm submit]', err)
      toast.error('Tidak bisa hubungi server')
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="size-6" />
        </div>
        <p className="font-display text-base font-bold text-emerald-900">
          Form order tersimpan
        </p>
        <p className="text-xs text-emerald-700">
          Buka halaman Form Order untuk salin link form.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border-2 border-primary-200 bg-card p-5"
    >
      <div className="space-y-1.5">
        <Label htmlFor="ob-of-name" className="text-xs">
          Nama form (untuk catatan internal)
        </Label>
        <Input
          id="ob-of-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="mis. Form Pesanan Skincare"
          className="h-9 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Produk yang ditampilkan di form</Label>
        {loadingProducts ? (
          <p className="text-xs text-warm-500">
            <Loader2 className="mr-1 inline size-3 animate-spin" />
            Memuat daftar produk…
          </p>
        ) : products.length === 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Belum ada produk aktif. Tambah produk dulu sebelum buat form.
          </p>
        ) : (
          <>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-warm-200 bg-warm-50 p-2">
              {products.map((p) => {
                const checked = selectedIds.includes(p.id)
                return (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-warm-100"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProduct(p.id)}
                      className="size-4 accent-primary-500"
                    />
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="font-mono text-xs text-warm-600">
                      Rp {p.price.toLocaleString('id-ID')}
                    </span>
                  </label>
                )
              })}
            </div>
            <p className="text-[10px] text-warm-500">
              {selectedIds.length} dari {products.length} produk dipilih.
              Default: semua produk aktif.
            </p>
          </>
        )}
      </div>

      <div className="rounded-md bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
        Form akan terima COD &amp; transfer, plus alamat pengiriman. Untuk
        atur ongkir custom / pixel tracking / social proof, edit dari halaman
        lengkap.
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="submit"
          disabled={submitting || products.length === 0}
          className="bg-primary-500 hover:bg-primary-600"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Menyimpan…
            </>
          ) : (
            <>
              <Save className="mr-2 size-4" />
              Simpan form order
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
