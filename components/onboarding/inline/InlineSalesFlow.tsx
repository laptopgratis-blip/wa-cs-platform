'use client'

// InlineSalesFlow — pilih salah satu template sales flow (COD / TRANSFER /
// BOOKING / CONSULTATION) → POST /api/sales-flows dengan steps + finalAction
// dari template, isActive=true. User bisa tweak isinya nanti dari halaman
// Cara Jualan.

import {
  CheckCircle2,
  Loader2,
  Save,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { InlineTaskCommonProps } from './InlineTaskHost'

interface SalesFlowTemplate {
  template: 'COD' | 'TRANSFER' | 'BOOKING' | 'CONSULTATION' | 'CUSTOM'
  name: string
  emoji: string
  description: string
  triggerKeywords: string[]
  steps: unknown[]
  finalAction: unknown
}

export function InlineSalesFlow({
  onCompleted,
  fallbackHref,
}: InlineTaskCommonProps) {
  const [templates, setTemplates] = useState<SalesFlowTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/sales-flows/templates', {
          cache: 'no-store',
        })
        const json = (await res.json()) as {
          success: boolean
          data?: { templates: SalesFlowTemplate[] }
        }
        if (cancelled) return
        if (res.ok && json.success && json.data) {
          // CUSTOM dipakai hanya untuk full edit — sembunyikan di onboarding
          // supaya pilihan tidak overwhelming.
          const filtered = json.data.templates.filter(
            (t) => t.template !== 'CUSTOM',
          )
          setTemplates(filtered)
          if (filtered.length > 0) setSelectedKey(filtered[0]!.template)
        }
      } catch (err) {
        console.warn('[InlineSalesFlow templates]', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit() {
    if (submitting || !selectedKey) return
    const tpl = templates.find((t) => t.template === selectedKey)
    if (!tpl) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/sales-flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tpl.name,
          template: tpl.template,
          description: tpl.description,
          triggerKeywords: tpl.triggerKeywords,
          steps: tpl.steps,
          finalAction: tpl.finalAction,
          isActive: true,
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal aktifkan sales flow')
        setSubmitting(false)
        return
      }
      toast.success(`Sales flow "${tpl.name}" aktif`)
      setDone(true)
      setTimeout(() => onCompleted(), 800)
    } catch (err) {
      console.error('[InlineSalesFlow submit]', err)
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
          Sales flow aktif
        </p>
        <p className="text-xs text-emerald-700">Lanjut ke step berikutnya…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border-2 border-primary-200 bg-card p-5">
      <div>
        <h3 className="font-display text-base font-bold text-warm-900">
          Pilih template alur jualan
        </h3>
        <p className="mt-0.5 text-xs text-warm-600">
          AI akan ikuti alur ini saat pelanggan tertarik beli. Bisa di-edit
          step-step-nya nanti.
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-warm-500">
          <Loader2 className="mr-1 inline size-3 animate-spin" />
          Memuat template…
        </p>
      ) : templates.length === 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Tidak ada template tersedia. Buka halaman lengkap untuk bikin manual.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {templates.map((t) => {
            const active = t.template === selectedKey
            return (
              <button
                key={t.template}
                type="button"
                onClick={() => setSelectedKey(t.template)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-all',
                  active
                    ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                    : 'border-warm-200 bg-warm-50 hover:border-warm-300',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden>
                    {t.emoji}
                  </span>
                  <span className="font-display text-sm font-bold text-warm-900">
                    {t.name}
                  </span>
                </div>
                <p className="line-clamp-2 text-[11px] text-warm-600">
                  {t.description}
                </p>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !selectedKey || templates.length === 0}
          className="bg-primary-500 hover:bg-primary-600"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Mengaktifkan…
            </>
          ) : (
            <>
              <Save className="mr-2 size-4" />
              Aktifkan template ini
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
