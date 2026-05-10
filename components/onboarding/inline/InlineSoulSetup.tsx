'use client'

// InlineSoulSetup — form simple buat Soul (kepribadian AI) langsung di
// wizard. Field minimal: nama, replyStyle (tombol pilihan: ramah/profesional/
// santai), businessContext (textarea singkat). POST /api/soul.
//
// Style options di-fetch dari /api/soul/options (admin curated). Kita pilih
// 3 style yang paling "umum" via heuristik nama (mengandung "ramah",
// "profesional", "santai") supaya UI deterministic untuk awam. Kalau tidak
// match, fallback pakai 3 style pertama.

import { CheckCircle2, Loader2, Save, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import type { InlineTaskCommonProps } from './InlineTaskHost'

interface SoulOption {
  id: string
  name: string
  description: string
}

interface OptionsResponse {
  personalities: SoulOption[]
  styles: SoulOption[]
}

// Heuristik untuk pilih 3 style yang paling sesuai dengan label "ramah",
// "profesional", "santai". Kalau tidak ada match → ambil 3 pertama.
function pickFeaturedStyles(styles: SoulOption[]): SoulOption[] {
  if (styles.length === 0) return []
  const lc = (s: string) => s.toLowerCase()
  const ramah =
    styles.find((s) => /ramah|hangat|friendly/.test(lc(s.name))) ?? null
  const pro =
    styles.find((s) => /profesion|formal|tegas/.test(lc(s.name))) ?? null
  const santai =
    styles.find((s) => /santai|casual|chill|gaul/.test(lc(s.name))) ?? null

  const picked: SoulOption[] = []
  if (ramah) picked.push(ramah)
  if (pro) picked.push(pro)
  if (santai) picked.push(santai)
  if (picked.length >= 3) return picked

  // Fill sisanya dengan style yang belum di-pick.
  for (const s of styles) {
    if (picked.length >= 3) break
    if (!picked.some((p) => p.id === s.id)) picked.push(s)
  }
  return picked
}

export function InlineSoulSetup({ onCompleted, fallbackHref }: InlineTaskCommonProps) {
  const [name, setName] = useState('CS Toko Saya')
  const [businessContext, setBusinessContext] = useState('')
  const [styles, setStyles] = useState<SoulOption[]>([])
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  // Fetch style options.
  useEffect(() => {
    let aborted = false
    async function load() {
      try {
        const res = await fetch('/api/soul/options', { cache: 'no-store' })
        const json = (await res.json()) as { success: boolean; data: OptionsResponse }
        if (aborted) return
        if (!res.ok || !json.success) {
          toast.error('Tidak bisa load pilihan gaya bicara')
          setLoading(false)
          return
        }
        const featured = pickFeaturedStyles(json.data.styles)
        setStyles(featured)
        setSelectedStyle(featured[0]?.id ?? null)
        setLoading(false)
      } catch (err) {
        console.error('[InlineSoulSetup load]', err)
        if (!aborted) setLoading(false)
      }
    }
    void load()
    return () => {
      aborted = true
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (name.trim().length < 2) {
      toast.error('Nama AI minimal 2 karakter')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/soul', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          replyStyle: selectedStyle,
          language: 'id',
          businessContext: businessContext.trim() || null,
          isDefault: true,
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal simpan Soul')
        setSubmitting(false)
        return
      }
      toast.success('Soul tersimpan')
      setDone(true)
      setTimeout(() => onCompleted(), 800)
    } catch (err) {
      console.error('[InlineSoulSetup submit]', err)
      toast.error('Tidak bisa hubungi server')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-warm-200 bg-warm-50 p-8 text-center">
        <Loader2 className="mb-2 size-6 animate-spin text-primary-500" />
        <p className="text-sm text-warm-600">Menyiapkan pilihan…</p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="size-6" />
        </div>
        <p className="font-display text-base font-bold text-emerald-900">
          Kepribadian AI tersimpan
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
      <div className="space-y-1.5">
        <Label htmlFor="ob-soul-name" className="text-xs">
          Nama AI (cuma untuk kamu, tidak terlihat pelanggan)
        </Label>
        <Input
          id="ob-soul-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="CS Toko Saya"
          className="h-9 text-sm"
        />
      </div>

      {styles.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Gaya bicara saat balas pelanggan</Label>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            {styles.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStyle(s.id)}
                className={cn(
                  'rounded-md border-2 px-3 py-2 text-left transition',
                  selectedStyle === s.id
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-200'
                    : 'border-warm-200 hover:border-warm-300 hover:bg-warm-50',
                )}
              >
                <div className="text-xs font-semibold text-warm-900">
                  {s.name}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[10px] text-warm-500">
                  {s.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="ob-soul-ctx" className="text-xs">
          Info bisnis singkat (apa yang dijual, untuk siapa)
        </Label>
        <Textarea
          id="ob-soul-ctx"
          rows={3}
          value={businessContext}
          onChange={(e) => setBusinessContext(e.target.value)}
          maxLength={1500}
          placeholder="Contoh: Saya jual sepatu sneakers wanita brand lokal. Target: cewek 18-35. Harga 250-500rb."
          className="text-xs"
        />
        <p className="flex items-center gap-1 text-[10px] text-warm-500">
          <Sparkles className="size-3" /> AI akan ikut konteks ini saat balas
          chat. Detail FAQ/jam buka tambah lagi di step Pengetahuan.
        </p>
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
              Simpan kepribadian
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
