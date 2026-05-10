'use client'

// InlineKnowledgeAdd — form simple buat 1 knowledge entry tipe TEXT langsung
// di wizard. POST /api/knowledge dengan contentType=TEXT. User bisa tambah
// lebih lanjut dari halaman /knowledge nanti.

import { CheckCircle2, ExternalLink, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import type { InlineTaskCommonProps } from './InlineTaskHost'

export function InlineKnowledgeAdd({
  onCompleted,
  fallbackHref,
}: InlineTaskCommonProps) {
  const [title, setTitle] = useState('Daftar Harga & Info Produk')
  const [textContent, setTextContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (title.trim().length < 2) {
      toast.error('Judul minimal 2 karakter')
      return
    }
    if (textContent.trim().length < 1) {
      toast.error('Isi tidak boleh kosong')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: 'TEXT',
          title: title.trim(),
          textContent: textContent.trim(),
          triggerKeywords: [],
          isActive: true,
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal simpan pengetahuan')
        setSubmitting(false)
        return
      }
      toast.success('Pengetahuan tersimpan')
      setDone(true)
      setTimeout(() => onCompleted(), 800)
    } catch (err) {
      console.error('[InlineKnowledgeAdd submit]', err)
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
          Pengetahuan tersimpan
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
        <Label htmlFor="ob-kn-title" className="text-xs">
          Judul (mis. &ldquo;Daftar Harga&rdquo;, &ldquo;Jam Buka&rdquo;,
          &ldquo;Alamat Toko&rdquo;)
        </Label>
        <Input
          id="ob-kn-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className="h-9 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ob-kn-content" className="text-xs">
          Isi
        </Label>
        <Textarea
          id="ob-kn-content"
          rows={6}
          value={textContent}
          onChange={(e) => setTextContent(e.target.value)}
          maxLength={2000}
          placeholder={
            'Contoh:\n• Sepatu Sneakers - Rp 350.000\n• Sandal Casual - Rp 150.000\n• Tas Tote Bag - Rp 200.000\n\nJam buka: Senin-Sabtu 09.00-18.00\nAlamat: Jl. Mawar No. 12, Jakarta'
          }
          className="text-xs"
        />
        <p className="text-[10px] text-warm-500">
          {textContent.length} / 2000 karakter. Bisa nambah pengetahuan lain
          (FAQ, return policy, dll) dari halaman Pengetahuan setelah ini.
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
              Simpan pengetahuan
            </>
          )}
        </Button>
        <Button asChild type="button" variant="ghost" size="sm">
          <Link href={fallbackHref}>
            <ExternalLink className="mr-1.5 size-3.5" />
            Buka halaman lengkap
          </Link>
        </Button>
      </div>
    </form>
  )
}
