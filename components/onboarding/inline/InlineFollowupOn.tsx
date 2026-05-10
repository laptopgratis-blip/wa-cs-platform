'use client'

// InlineFollowupOn — 1-tombol "Aktifkan + seed default" pakai endpoint
// `/api/integrations/followup/enable` (idempotent: kalau user sudah punya
// template, no-op). Setelah seed, autoCheck `followup_enabled` (followup
// template count > 0) langsung true → step ke-tick.

import { CheckCircle2, Loader2, Zap } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import type { InlineTaskCommonProps } from './InlineTaskHost'

export function InlineFollowupOn({
  onCompleted,
  fallbackHref,
}: InlineTaskCommonProps) {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleActivate() {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/integrations/followup/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { seeded: number; alreadyHadTemplates: boolean }
        error?: string
      }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal aktifkan follow-up')
        setSubmitting(false)
        return
      }
      const seeded = json.data?.seeded ?? 0
      toast.success(
        seeded > 0
          ? `${seeded} template default berhasil dibuat`
          : 'Follow-up sudah aktif',
      )
      setDone(true)
      setTimeout(() => onCompleted(), 800)
    } catch (err) {
      console.error('[InlineFollowupOn]', err)
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
          Follow-up otomatis aktif
        </p>
        <p className="text-xs text-emerald-700">Lanjut ke step berikutnya…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border-2 border-primary-200 bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
          <Zap className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-base font-bold text-warm-900">
            Aktifkan follow-up otomatis
          </h3>
          <p className="mt-1 text-xs text-warm-600">
            Klik tombol di bawah untuk aktifkan + buat 7 template default
            (reminder bayar, konfirmasi paid, info pengiriman, dll). Bisa
            edit kata-katanya nanti dari halaman Follow-Up.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleActivate}
          disabled={submitting}
          className="bg-primary-500 hover:bg-primary-600"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Memproses…
            </>
          ) : (
            <>
              <Zap className="mr-2 size-4" />
              Aktifkan + buat template default
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
