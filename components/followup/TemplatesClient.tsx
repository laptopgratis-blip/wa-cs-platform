'use client'

// Template Follow-Up Order System (POWER only).
// Group templates by trigger, modal create/edit (TemplateModal) dengan
// variable buttons + preview live + pemilih Template Meta (sesi Cloud API) +
// tombol test send ke nomor admin user.
import { Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  STATUS_LABEL,
  STATUS_TONE,
  type TemplateStatus,
} from '@/components/waba-templates/types'
import { cn } from '@/lib/utils'

import {
  TRIGGERS,
  type FollowUpTemplateDto as Template,
  type FormItem,
} from './followup-template-types'
import { TemplateModal } from './TemplateModal'

export function TemplatesClient({
  forms,
  hasCloud,
  highlightId,
}: {
  forms: FormItem[]
  /** User punya sesi Cloud API → tampilkan pemilih Template Meta. */
  hasCloud: boolean
  /** Dari link notifikasi gagal kirim (?highlight=<id>). */
  highlightId?: string | null
}) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Template | null>(null)
  const [creating, setCreating] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/followup/templates', {
          cache: 'no-store',
        })
        const json = await res.json()
        if (cancelled) return
        if (!json.success) {
          setError(json.error)
        } else {
          setError(null)
          setTemplates(json.data ?? [])
        }
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // Gulir ke template yang disorot (link notifikasi) setelah daftar termuat.
  useEffect(() => {
    if (loading || !highlightId) return
    document
      .getElementById(`followup-template-${highlightId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [loading, highlightId])

  const grouped = useMemo(() => {
    const map = new Map<string, Template[]>()
    for (const t of TRIGGERS) map.set(t.value, [])
    for (const tmpl of templates) {
      const arr = map.get(tmpl.trigger) ?? []
      arr.push(tmpl)
      map.set(tmpl.trigger, arr)
    }
    return map
  }, [templates])

  async function handleToggleActive(t: Template) {
    setActionId(t.id)
    try {
      const res = await fetch(`/api/followup/templates/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !t.isActive }),
      })
      const json = await res.json()
      if (!json.success) toast.error(json.error ?? 'Gagal ubah status template')
      else {
        setLoading(true)
        reload()
      }
    } finally {
      setActionId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setActionId(deleteTarget.id)
    try {
      const res = await fetch(`/api/followup/templates/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!json.success) toast.error(json.error ?? 'Gagal hapus template')
      else {
        setDeleteTarget(null)
        setLoading(true)
        reload()
      }
    } finally {
      setActionId(null)
    }
  }

  async function handleTestSend(t: Template) {
    setActionId(t.id)
    try {
      const res = await fetch(`/api/followup/templates/${t.id}/test-send`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!json.success) toast.error(json.error ?? 'Gagal kirim test')
      else
        toast.success(`Test terkirim ke ${json.data.to}`, {
          description: json.data.preview,
        })
    } finally {
      setActionId(null)
    }
  }

  return (
    // Container halaman ada di app/(dashboard)/pesanan/templates/page.tsx
    // supaya banner template Meta ikut di dalam wrapper yang sama.
    <>
      <PageHeader
        title="Template Follow-Up"
        description="Atur isi pesan otomatis per event order — aktif/nonaktif per template."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1 size-4" /> Tambah Template
          </Button>
        }
      />

      {loading ? (
        <CardGridSkeleton count={4} />
      ) : error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <div className="space-y-6">
          {TRIGGERS.map((trigger) => {
            const items = grouped.get(trigger.value) ?? []
            return (
              <section key={trigger.value}>
                <h2 className="text-muted-foreground mb-2 flex items-center gap-3 text-sm font-semibold tracking-wide uppercase">
                  {trigger.label}
                  <span className="bg-border h-px flex-1" aria-hidden />
                </h2>
                {items.length === 0 ? (
                  <p className="text-muted-foreground text-sm italic">
                    (belum ada — klik Tambah Template untuk buat)
                  </p>
                ) : (
                  <div className="space-y-2">
                    {items.map((t) => (
                      <Card
                        key={t.id}
                        id={`followup-template-${t.id}`}
                        className={cn(
                          !t.isActive && 'opacity-60',
                          t.id === highlightId && 'ring-2 ring-primary-400',
                        )}
                      >
                        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{t.name}</span>
                              {t.isDefault && (
                                <Badge variant="secondary">DEFAULT</Badge>
                              )}
                              {t.paymentMethod && (
                                <Badge variant="outline">
                                  {t.paymentMethod}
                                </Badge>
                              )}
                              {t.orderType && (
                                <Badge variant="outline">
                                  {t.orderType === 'DIGITAL'
                                    ? 'DIGITAL'
                                    : 'FISIK'}
                                </Badge>
                              )}
                              {t.scope === 'FORM' && (
                                <Badge variant="outline">PER-FORM</Badge>
                              )}
                              {t.delayDays > 0 && (
                                <Badge variant="outline">
                                  +{t.delayDays} hari
                                </Badge>
                              )}
                            </div>
                            <MetaLinkBadges template={t} />
                            {(t.applyOnPaymentStatus ||
                              t.applyOnDeliveryStatus) && (
                              <p className="text-muted-foreground text-xs">
                                Hanya kalau:{' '}
                                {t.applyOnPaymentStatus &&
                                  `payment=${t.applyOnPaymentStatus}`}
                                {t.applyOnPaymentStatus &&
                                  t.applyOnDeliveryStatus &&
                                  ', '}
                                {t.applyOnDeliveryStatus &&
                                  `delivery=${t.applyOnDeliveryStatus}`}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Switch
                              checked={t.isActive}
                              disabled={actionId === t.id}
                              onCheckedChange={() => handleToggleActive(t)}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actionId === t.id}
                              onClick={() => setEditing(t)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actionId === t.id}
                              onClick={() => handleTestSend(t)}
                            >
                              <Send className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actionId === t.id}
                              onClick={() => setDeleteTarget(t)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {(creating || editing !== null) && (
        <TemplateModal
          // key remount supaya useState initial value re-evaluate per template.
          // Hindari useEffect setState reset (react-hooks/set-state-in-effect).
          key={editing?.id ?? 'new'}
          template={editing}
          forms={forms}
          hasCloud={hasCloud}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            setLoading(true)
            reload()
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
        title="Hapus Template Follow-Up?"
        description={
          <>
            Template <strong>{deleteTarget?.name}</strong> akan dihapus permanen
            dan tidak bisa dikembalikan.
          </>
        }
        isLoading={actionId === deleteTarget?.id}
        onConfirm={confirmDelete}
      />
    </>
  )
}

// Template Meta tertaut (status) + peringatan bila tautan basi (WABA lama /
// template dihapus) — seller perlu memilih ulang di modal edit.
function MetaLinkBadges({ template }: { template: Template }) {
  const meta = template.metaTemplate
  if (!meta && !template.metaIssue) return null
  const status = meta?.status as TemplateStatus | undefined
  return (
    <div className="flex flex-wrap items-center gap-2">
      {meta && status && (
        <StatusBadge
          tone={STATUS_TONE[status] ?? 'neutral'}
          label={`Template Meta: ${meta.name} · ${STATUS_LABEL[status] ?? status}`}
        />
      )}
      {template.metaIssue && (
        <StatusBadge tone="danger" label="Template Meta perlu dipilih ulang" />
      )}
    </div>
  )
}
