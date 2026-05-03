'use client'

// Form buat/edit Soul dengan live preview system prompt.
// Mode: create (soul=null) atau edit (soul ada).
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
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
import {
  buildSystemPrompt,
  LANGUAGES,
  PERSONALITIES,
  REPLY_STYLES,
  type Language,
  type Personality,
  type ReplyStyle,
} from '@/lib/soul'
import { soulCreateSchema, type SoulCreateInput } from '@/lib/validations/soul'

export interface SoulInitialValues {
  id?: string
  name: string
  personality: Personality | null
  language: Language
  replyStyle: ReplyStyle | null
  businessContext: string | null
  isDefault: boolean
}

interface SoulFormProps {
  initial?: SoulInitialValues
  onDone: () => void
}

const DEFAULTS: SoulInitialValues = {
  name: '',
  personality: 'RAMAH',
  language: 'id',
  replyStyle: 'SINGKAT',
  businessContext: '',
  isDefault: false,
}

const NONE = '__NONE__' as const

export function SoulForm({ initial, onDone }: SoulFormProps) {
  const router = useRouter()
  const isEdit = Boolean(initial?.id)
  const [isSubmitting, setSubmitting] = useState(false)
  const [isDeleting, setDeleting] = useState(false)

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
  // Live preview yang di-update setiap kali field berubah.
  const preview = useMemo(
    () =>
      buildSystemPrompt({
        name: watched.name || 'Customer Service AI',
        personality: watched.personality ?? null,
        language: watched.language || 'id',
        replyStyle: watched.replyStyle ?? null,
        businessContext: watched.businessContext ?? null,
      }),
    [watched.name, watched.personality, watched.language, watched.replyStyle, watched.businessContext],
  )

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
      <div className="grid gap-4 md:grid-cols-2">
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
              value={watched.personality ?? NONE}
              onValueChange={(v) =>
                form.setValue('personality', v === NONE ? null : (v as Personality), {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih kepribadian" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Tidak ditentukan</SelectItem>
                {PERSONALITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
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
            <Label>Gaya Balas</Label>
            <Select
              value={watched.replyStyle ?? NONE}
              onValueChange={(v) =>
                form.setValue('replyStyle', v === NONE ? null : (v as ReplyStyle), {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih gaya" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Tidak ditentukan</SelectItem>
                {REPLY_STYLES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="businessContext">Konteks Bisnis</Label>
            <Textarea
              id="businessContext"
              rows={6}
              placeholder="Info produk, harga, FAQ, jam buka, alamat toko, kebijakan return, dst."
              {...form.register('businessContext')}
            />
            <p className="text-xs text-muted-foreground">
              Semua info ini akan dipakai AI untuk menjawab pertanyaan customer.
            </p>
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

        <div className="flex flex-col">
          <Label className="mb-2">Preview System Prompt</Label>
          <pre className="flex-1 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
            {preview}
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            Inilah teks yang dikirim ke Claude sebagai system prompt setiap kali ada
            pesan masuk.
          </p>
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
