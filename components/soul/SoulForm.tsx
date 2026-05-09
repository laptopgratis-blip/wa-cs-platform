'use client'

// Form buat/edit Soul. Pilihan kepribadian & gaya balas di-fetch dari
// /api/soul/options — user hanya melihat name + description, snippet AI
// disembunyikan (rahasia perusahaan, hanya admin yang bisa lihat).
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { LANGUAGES, type Language } from '@/lib/soul'
import { soulCreateSchema, type SoulCreateInput } from '@/lib/validations/soul'

// id berisi cuid SoulPersonality / SoulStyle (atau enum legacy untuk Soul lama).
export interface SoulInitialValues {
  id?: string
  name: string
  personality: string | null
  language: Language
  replyStyle: string | null
  businessContext: string | null
  isDefault: boolean
}

interface SoulFormProps {
  initial?: SoulInitialValues
  onDone: () => void
}

interface SoulOption {
  id: string
  name: string
  description: string
}

const DEFAULTS: SoulInitialValues = {
  name: '',
  personality: null,
  language: 'id',
  replyStyle: null,
  businessContext: '',
  isDefault: false,
}

const NONE = '__NONE__' as const

// Sinkron dengan validasi server di lib/validations/soul.ts. ~1500 char =
// ~375 token; cocok untuk info produk inti tanpa boros budget tiap reply.
const BUSINESS_CONTEXT_LIMIT = 1500

export function SoulForm({ initial, onDone }: SoulFormProps) {
  const router = useRouter()
  const isEdit = Boolean(initial?.id)
  const [isSubmitting, setSubmitting] = useState(false)
  const [isDeleting, setDeleting] = useState(false)
  const [personalities, setPersonalities] = useState<SoulOption[]>([])
  const [styles, setStyles] = useState<SoulOption[]>([])

  const form = useForm<SoulCreateInput>({
    resolver: zodResolver(soulCreateSchema),
    defaultValues: {
      name: initial?.name ?? DEFAULTS.name,
      personality: initial?.personality ?? DEFAULTS.personality,
      language: initial?.language ?? DEFAULTS.language,
      replyStyle: initial?.replyStyle ?? DEFAULTS.replyStyle,
      businessContext: initial?.businessContext ?? DEFAULTS.businessContext,
      isDefault: initial?.isDefault ?? DEFAULTS.isDefault,
    },
  })

  const watched = form.watch()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/soul/options')
        const json = (await res.json().catch(() => null)) as
          | { success: boolean; data?: { personalities: SoulOption[]; styles: SoulOption[] } }
          | null
        if (!cancelled && json?.success && json.data) {
          setPersonalities(json.data.personalities)
          setStyles(json.data.styles)
        }
      } catch {
        // Diam saja — dropdown akan kosong dan user bisa pilih "Tidak ditentukan".
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Kalau Soul lama menyimpan enum legacy yang tidak ada di daftar baru,
  // tetap tampilkan id-nya sebagai placeholder agar value Select tidak kosong.
  const personalityValue = watched.personality ?? NONE
  const isLegacyPersonality =
    !!watched.personality && !personalities.some((p) => p.id === watched.personality)
  const replyStyleValue = watched.replyStyle ?? NONE
  const isLegacyStyle =
    !!watched.replyStyle && !styles.some((s) => s.id === watched.replyStyle)

  async function onSubmit(values: SoulCreateInput) {
    setSubmitting(true)
    try {
      const url = isEdit ? `/api/soul/${initial!.id}` : '/api/soul'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; error?: string }
        | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Gagal menyimpan soul')
        return
      }
      toast.success(isEdit ? 'Soul diperbarui' : 'Soul dibuat')
      router.refresh()
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!initial?.id) return
    if (!confirm('Yakin hapus soul ini? WA session yang pakai soul ini akan dilepas.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/soul/${initial.id}`, { method: 'DELETE' })
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; error?: string }
        | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Gagal menghapus soul')
        return
      }
      toast.success('Soul dihapus')
      router.refresh()
      onDone()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 py-2" noValidate>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nama Soul</Label>
          <Input
            id="name"
            placeholder="Misalnya: Sari CS Toko Baju"
            {...form.register('name')}
          />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Kepribadian</Label>
          <Select
            value={personalityValue}
            onValueChange={(v) =>
              form.setValue('personality', v === NONE ? null : v, {
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Pilih kepribadian" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Tidak ditentukan</SelectItem>
              {personalities.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex flex-col">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.description}
                    </span>
                  </span>
                </SelectItem>
              ))}
              {isLegacyPersonality && watched.personality && (
                <SelectItem value={watched.personality}>
                  {watched.personality} (lama — pilih ulang)
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Gaya Balas</Label>
          <Select
            value={replyStyleValue}
            onValueChange={(v) =>
              form.setValue('replyStyle', v === NONE ? null : v, {
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Pilih gaya" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Tidak ditentukan</SelectItem>
              {styles.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex flex-col">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.description}
                    </span>
                  </span>
                </SelectItem>
              ))}
              {isLegacyStyle && watched.replyStyle && (
                <SelectItem value={watched.replyStyle}>
                  {watched.replyStyle} (lama — pilih ulang)
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Bahasa</Label>
          <Select
            value={watched.language}
            onValueChange={(v) =>
              form.setValue('language', v as Language, { shouldDirty: true })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="businessContext">Konteks Produk</Label>
            <span
              className={`text-xs tabular-nums ${
                (watched.businessContext?.length ?? 0) > BUSINESS_CONTEXT_LIMIT
                  ? 'font-semibold text-destructive'
                  : (watched.businessContext?.length ?? 0) >
                      BUSINESS_CONTEXT_LIMIT * 0.85
                    ? 'text-amber-600'
                    : 'text-muted-foreground'
              }`}
            >
              {watched.businessContext?.length ?? 0}/{BUSINESS_CONTEXT_LIMIT}
            </span>
          </div>
          <Textarea
            id="businessContext"
            rows={4}
            placeholder={`Contoh:
Cleanoz 12ml — Rp 89.000. Pembersih kerak kerang & jamur untuk kamar mandi/dapur.
Cleanoz 30ml — Rp 175.000. Versi hemat untuk pemakaian sebulan penuh.
Pengiriman J&T/SiCepat dari Bandung.`}
            {...form.register('businessContext')}
          />
          <div className="rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
            <p className="font-semibold">
              Cuma info inti produk (harga, fitur singkat).
            </p>
            <p className="mt-0.5 text-blue-800">
              FAQ, jam buka, alamat toko, kebijakan return, testimoni, link
              tokopedia/shopee, file panduan — simpan di{' '}
              <a
                href="/knowledge"
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline hover:no-underline"
              >
                Knowledge Base
              </a>
              . Knowledge ditarik otomatis hanya saat customer tanya hal terkait
              (keyword match), jadi tidak boros token tiap balasan.
            </p>
          </div>
          {(watched.businessContext?.length ?? 0) > BUSINESS_CONTEXT_LIMIT && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              <span className="font-semibold">⚠️ Konteks terlalu panjang.</span>{' '}
              Pisahkan FAQ & info detail ke{' '}
              <a
                href="/knowledge"
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline hover:no-underline"
              >
                /knowledge
              </a>{' '}
              — di sini cukup info produk inti saja.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label>Jadikan default</Label>
            <p className="text-xs text-muted-foreground">
              Soul default otomatis dipilih saat menambah WA baru.
            </p>
          </div>
          <Switch
            checked={watched.isDefault ?? false}
            onCheckedChange={(v) => form.setValue('isDefault', v, { shouldDirty: true })}
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
        <div>
          {isEdit && (
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              disabled={isDeleting || isSubmitting}
              className="text-destructive hover:text-destructive"
            >
              {isDeleting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 size-4" />
              )}
              Hapus Soul
            </Button>
          )}
        </div>
        <div className="flex gap-2 sm:justify-end">
          <Button type="button" variant="ghost" onClick={onDone}>
            Batal
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isEdit ? 'Simpan Perubahan' : 'Buat Soul'}
          </Button>
        </div>
      </div>
    </form>
  )
}
