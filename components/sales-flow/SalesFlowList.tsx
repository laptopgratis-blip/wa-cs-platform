'use client'

// Halaman utama /cara-jualan. Tampilkan template pre-built (atas) + flow yang
// sudah dibuat user (bawah). Sheet editor di-share antara create dari template
// dan edit existing.
import {
  CalendarDays,
  CreditCard,
  MessagesSquare,
  PenLine,
  Pencil,
  ShoppingBag,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { OnboardingHint } from '@/components/onboarding/OnboardingHint'
import { SalesFlowForm } from '@/components/sales-flow/SalesFlowForm'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { CardGridSkeleton } from '@/components/shared/skeletons'
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
import { TONES } from '@/lib/ui-tones'
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

// Ikon per template — pengganti emoji dari data supaya konsisten dengan icon
// set lucide di seluruh dashboard.
const TEMPLATE_ICON: Record<TemplatePreview['template'], LucideIcon> = {
  COD: Truck,
  TRANSFER: CreditCard,
  BOOKING: CalendarDays,
  CONSULTATION: MessagesSquare,
  CUSTOM: PenLine,
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
        const json = (await res.json().catch(() => null)) as {
          success: boolean
          data?: { templates: TemplatePreview[] }
        } | null
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
      const json = (await res.json().catch(() => null)) as {
        success: boolean
        error?: string
      } | null
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
      <PageHeader
        title="Cara Jualan"
        description={
          <>
            Atur AI untuk terima pesanan otomatis dari customer — COD, Transfer,
            Booking, atau buat alur sendiri.
            <span className="text-muted-foreground mt-1 block text-xs">
              {activeCount} dari {limit} flow aktif
            </span>
          </>
        }
      />

      {/* Template picker */}
      <div className="space-y-3">
        <h2 className="font-display text-warm-500 text-sm font-semibold tracking-wide uppercase">
          Pilih template
        </h2>
        {loadingTpl ? (
          <CardGridSkeleton count={3} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tpl) => {
              const TplIcon = TEMPLATE_ICON[tpl.template] ?? PenLine
              return (
                <Card key={tpl.template}>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="bg-primary-50 text-primary-600 flex size-9 items-center justify-center rounded-lg"
                      >
                        <TplIcon className="size-5" />
                      </span>
                      <h3 className="font-display text-base font-semibold">
                        {tpl.name}
                      </h3>
                    </div>
                    <p className="text-muted-foreground text-sm">
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
              )
            })}
          </div>
        )}
        {isFull && (
          <p className={`text-xs ${TONES.warning.text}`}>
            Sudah mencapai batas {limit} flow aktif — nonaktifkan salah satu di
            bawah dulu kalau mau aktifkan template lain.
          </p>
        )}
      </div>

      {/* List flow user */}
      <div className="space-y-3">
        <h2 className="font-display text-warm-500 text-sm font-semibold tracking-wide uppercase">
          Flow saya
        </h2>
        {flows.length === 0 ? (
          <EmptyState
            bordered
            icon={ShoppingBag}
            title="Belum ada flow yang dibuat"
            description="Pilih template di atas untuk mulai, atau buat alur custom dari nol."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {flows.map((f) => (
              <Card key={f.id} className="hover-lift">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display truncate text-base font-semibold">
                          {f.name}
                        </h3>
                        {!f.isActive && (
                          <Badge variant="outline" className="font-normal">
                            Off
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs">
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
                    <p className="text-muted-foreground line-clamp-2 text-sm">
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
                    <span className="text-muted-foreground text-xs">
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

      <Sheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto px-6 sm:max-w-2xl"
        >
          <SheetHeader className="px-0">
            <SheetTitle>
              {editing?.mode === 'edit'
                ? `Atur Flow: ${editing.flow.name}`
                : editing?.mode === 'create-from-template'
                  ? editing.template.name
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
