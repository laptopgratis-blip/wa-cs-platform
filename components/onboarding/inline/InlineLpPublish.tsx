'use client'

// InlineLpPublish — embed LpGratisWizard (4-step LP gratis) langsung di
// onboarding wizard. Setelah user paste HTML di step 4, langsung publish
// LP via PATCH /api/lp/:id { isPublished: true } supaya autoCheck
// `lp_published` terpenuhi tanpa user perlu pindah halaman ke editor.

import { CheckCircle2, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import { LpGratisWizard } from '../LpGratisWizard'

import type { InlineTaskCommonProps } from './InlineTaskHost'

export function InlineLpPublish({
  onCompleted,
  fallbackHref,
}: InlineTaskCommonProps) {
  const [publishing, setPublishing] = useState(false)
  const [done, setDone] = useState(false)

  async function publishLp(lpId: string) {
    if (publishing) return
    setPublishing(true)
    try {
      const res = await fetch(`/api/lp/${lpId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: true }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(
          json.error ||
            'Gagal publish LP — buka halaman lengkap untuk publish manual',
        )
        setPublishing(false)
        return
      }
      toast.success('LP berhasil di-publish')
      setDone(true)
      setTimeout(() => onCompleted(), 1200)
    } catch (err) {
      console.error('[InlineLpPublish publish]', err)
      toast.error('Tidak bisa hubungi server')
      setPublishing(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="size-6" />
        </div>
        <p className="font-display text-base font-bold text-emerald-900">
          Landing page online
        </p>
        <p className="text-xs text-emerald-700">Lanjut ke step berikutnya…</p>
      </div>
    )
  }

  if (publishing) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-warm-200 bg-warm-50 p-8 text-center">
        <Loader2 className="mb-2 size-6 animate-spin text-primary-500" />
        <p className="text-sm text-warm-600">Memublish landing page…</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
        Ikuti 4 step di bawah: siapkan foto → upload → copy prompt ke ChatGPT
        / Claude.ai → tempel HTML hasil. Setelah klik &ldquo;Tempel HTML &amp;
        Publish&rdquo; di akhir, LP otomatis online.
      </div>
      <LpGratisWizard onCompleted={publishLp} />
    </div>
  )
}
