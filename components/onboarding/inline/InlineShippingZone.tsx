'use client'

// InlineShippingZone — bikin zona ongkir "default" inline tanpa harus buka
// halaman /shipping-zones (yang butuh search kota via Komerce).
//
// Strategi simple: zona matchType=ALL (apply ke semua tujuan) tanpa subsidi.
// Cukup untuk auto-check `shipping_zone_added` (count > 0) ke-tick. User
// bisa setup zona spesifik (per kota / provinsi + subsidi) dari halaman
// lengkap kapan saja.

import { CheckCircle2, Loader2, Save, Truck } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { InlineTaskCommonProps } from './InlineTaskHost'

export function InlineShippingZone({
  onCompleted,
  fallbackHref,
}: InlineTaskCommonProps) {
  const [name, setName] = useState('Semua Tujuan (default)')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (name.trim().length < 1) {
      toast.error('Nama zona wajib diisi')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/shipping-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          matchType: 'ALL',
          cityIds: [],
          provinceIds: [],
          cityNames: [],
          provinceNames: [],
          subsidyType: 'NONE',
          subsidyValue: 0,
          isActive: true,
          priority: 0,
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal simpan zona')
        setSubmitting(false)
        return
      }
      toast.success('Zona ongkir tersimpan')
      setDone(true)
      setTimeout(() => onCompleted(), 800)
    } catch (err) {
      console.error('[InlineShippingZone submit]', err)
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
          Zona ongkir tersimpan
        </p>
        <p className="text-xs text-emerald-700">Lanjut ke step berikutnya…</p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border-2 border-primary-200 bg-card p-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
          <Truck className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-base font-bold text-warm-900">
            Setup zona ongkir default
          </h3>
          <p className="mt-0.5 text-xs text-warm-600">
            Bikin zona yang berlaku untuk <strong>semua tujuan</strong> tanpa
            subsidi. Ongkir akan dihitung otomatis lewat Komerce. Atur zona
            khusus per kota / subsidi dari halaman lengkap nanti.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ob-zone-name" className="text-xs">
          Nama zona (untuk catatan internal)
        </Label>
        <Input
          id="ob-zone-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className="h-9 text-sm"
        />
      </div>

      <div className="rounded-md bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
        💡 Untuk setup gratis ongkir per area / subsidi flat / minimum order,
        buka halaman lengkap setelah ini.
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="submit"
          disabled={submitting}
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
              Simpan zona default
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
