'use client'

// Halaman utama /cara-jualan. Tampilkan template pre-built (atas) + flow yang
// sudah dibuat user (bawah). Sheet editor di-share antara create dari template
// dan edit existing.
import { Pencil, Plus, ShoppingBag } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { OnboardingHint } from '@/components/onboarding/OnboardingHint'
import { SalesFlowForm } from '@/components/sales-flow/SalesFlowForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import {
  type SalesFlowFinalActionInput,
  type SalesFlowStepInput,
} from '@/lib/validations/sales-flow'

export interface SalesFlowListItem {
  id: string
  name: string
  template: string
  description: string | null
  triggerKeywords: string[]
  steps: SalesFlowStepInput[]
  finalAction: SalesFlowFinalActionInput
  isActive: boolean
}

interface TemplatePreview {
  template: 'COD' | 'TRANSFER' | 'BOOKING' | 'CONSULTATION' | 'CUSTOM'
  name: string
  emoji: string
  description: string
  triggerKeywords: string[]
  steps: SalesFlowStepInput[]
  finalAction: SalesFlowFinalActionInput
}

interface Props {
  flows: SalesFlowListItem[]
  activeCount: number
  limit: number
}

// Editing state — kalau null, sheet tertutup. Kalau ada, sheet terbuka:
// - mode 'create-from-template': build dari template, POST saat simpan
// - mode 'edit': PATCH ke /api/sales-flows/[id]
type EditingState =
  | {
      mode: 'create-from-template'
      template: TemplatePreview
    }
  | {
      mode: 'edit'
      flow: SalesFlowListItem
    }
  | null

export function SalesFlowList({ flows, activeCount, limit }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<EditingState>(null)
  const [templates, setTemplates] = useState<TemplatePreview[]>([])
  const [loadingTpl, setLoadingTpl] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/sales-flows/templates')
        const json = (await res.json().catch(() => null)) as
          | { success: boolean; data?: { templates: TemplatePreview[] } }
          | null
        if (!cancelled && json?.success && json.data) {
          setTemplates(json.data.templates)
        }
      } finally {
        if (!cancelled) setLoadingTpl(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function openTemplate(tpl: TemplatePreview) {
    setEditing({ mode: 'create-from-template', template: tpl })
  }

  function openEdit(flow: SalesFlowListItem) {
    setEditing({ mode: 'edit', flow })
  }

  async function toggleActive(flow: SalesFlowListItem, next: boolean) {
    setTogglingId(flow.id)
    try {
      const res = await fetch(`/api/sales-flows/${flow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      })
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; error?: string }
        | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Gagal mengubah status')
        return
      }
      toast.success(next ? 'Flow diaktifkan' : 'Flow dinonaktifkan')
      router.refresh()
    } finally {
      setTogglingId(null)
    }
  }

  const isFull = activeCount >= limit

  return (
    <>
      <OnboardingHint
        hintId="cara-jualan"
        relevantFor={['SELL_WA']}
        matchMessage="Pilih template paling cocok dulu (COD / Transfer / Booking) — kamu bisa edit step-stepnya nanti. AI akan ikuti alur ini saat customer chat."
      />
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Cara Jualan
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Atur AI untuk terima pesanan otomatis dari customer — COD, Transfer,
          Booking, atau buat alur sendiri.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {activeCount} dari {limit} flow aktif
        </p>
      </div>

      {/* Template picker */}
      <div className="space-y-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-warm-500">
          Pilih template
        </h2>
        {loadingTpl ? (
          <p className="text-sm text-muted-foreground">Memuat template…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tpl) => (
              <Card key={tpl.template} className="rounded-xl border-warm-200">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="text-2xl leading-none">
                      {tpl.emoji}
                    </span>
                    <h3 className="font-display font-bold">{tpl.name}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {tpl.description}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openTemplate(tpl)}
                    disabled={isFull && tpl.template !== 'CUSTOM'}
                    className="w-full"
                  >
                    {tpl.template === 'CUSTOM' ? 'Buat Baru' : 'Aktifkan'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {isFull && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Sudah mencapai batas {limit} flow aktif — nonaktifkan salah satu di
            bawah dulu kalau mau aktifkan template lain.
          </p>
        )}
      </div>

      {/* List flow user */}
      <div className="space-y-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-warm-500">
          Flow saya
        </h2>
        {flows.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <ShoppingBag className="size-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">Belum ada flow yang dibuat</p>
                <p className="text-sm text-muted-foreground">
                  Pilih template di atas untuk mulai, atau buat alur custom dari
                  nol.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {flows.map((f) => (
              <Card
                key={f.id}
                className="rounded-xl border-warm-200 shadow-sm hover-lift"
              >
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-display font-bold">
                          {f.name}
                        </h3>
                        {!f.isActive && (
                          <Badge variant="outline" className="font-normal">
                            Off
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {f.template} · {f.steps.length} pertanyaan
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(f)}
                      aria-label="Edit flow"
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </div>

                  {f.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {f.description}
                    </p>
                  )}

                  {f.triggerKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {f.triggerKeywords.slice(0, 6).map((kw) => (
                        <Badge
                          key={kw}
                          variant="secondary"
                          className="font-normal"
                        >
                          {kw}
                        </Badge>
                      ))}
                      {f.triggerKeywords.length > 6 && (
                        <Badge variant="outline" className="font-normal">
                          +{f.triggerKeywords.length - 6}
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-xs text-muted-foreground">
                      {f.finalAction.notifyAdmin && f.finalAction.adminPhone
                        ? `Notif admin: ${f.finalAction.adminPhone}`
                        : 'Tanpa notif admin'}
                    </span>
                    <Switch
                      checked={f.isActive}
                      disabled={togglingId === f.id}
                      onCheckedChange={(v) => toggleActive(f, v)}
                      aria-label="Aktif/Nonaktif"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl px-6"
        >
          <SheetHeader className="px-0">
            <SheetTitle>
              {editing?.mode === 'edit'
                ? `Atur Flow: ${editing.flow.name}`
                : editing?.mode === 'create-from-template'
                  ? `${editing.template.emoji} ${editing.template.name}`
                  : 'Atur Flow'}
            </SheetTitle>
            <SheetDescription>
              Sesuaikan pertanyaan AI ke customer + balasan saat selesai.
            </SheetDescription>
          </SheetHeader>
          {editing && (
            <SalesFlowForm
              key={
                editing.mode === 'edit'
                  ? editing.flow.id
                  : `tpl-${editing.template.template}`
              }
              mode={editing.mode}
              source={
                editing.mode === 'edit'
                  ? { kind: 'edit', flow: editing.flow }
                  : { kind: 'template', template: editing.template }
              }
              onDone={() => setEditing(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

export type { TemplatePreview }
