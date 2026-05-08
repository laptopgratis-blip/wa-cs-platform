'use client'

// Template Follow-Up Order System (POWER only).
// Group templates by trigger, modal create/edit dengan variable buttons +
// preview live + tombol test send ke nomor admin user.
import {
  Eye,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

const TRIGGERS = [
  { value: 'ORDER_CREATED', label: 'Saat Order Masuk' },
  { value: 'PAYMENT_PAID', label: 'Saat Pembayaran Diterima' },
  { value: 'SHIPPED', label: 'Saat Order Dikirim' },
  { value: 'COMPLETED', label: 'Saat Order Selesai' },
  { value: 'CANCELLED', label: 'Saat Order Dibatalkan' },
  { value: 'DAYS_AFTER_ORDER', label: 'N Hari Setelah Order' },
  { value: 'DAYS_AFTER_PAID', label: 'N Hari Setelah Pembayaran' },
  { value: 'DAYS_AFTER_SHIPPED', label: 'N Hari Setelah Dikirim' },
] as const

const PAYMENT_STATUSES = ['PENDING', 'WAITING_CONFIRMATION', 'PAID', 'CANCELLED']
const DELIVERY_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
]

const VARIABLES = [
  '{nama}',
  '{invoice}',
  '{total}',
  '{produk}',
  '{rekening}',
  '{wa_admin}',
  '{alamat}',
  '{etd}',
  '{kurir}',
  '{resi}',
  '{nama_toko}',
  '{invoice_url}',
]

// Dummy values untuk preview di modal — sinkron dengan
// lib/services/followup-variables.ts DUMMY_RESOLVE_CONTEXT.
const DUMMY_PREVIEW: Record<string, string> = {
  '{nama}': 'Andi Pratama (TEST)',
  '{invoice}': 'INV-TEST-001',
  '{total}': 'Rp 150.000',
  '{produk}': '- Produk Test × 2 (Rp 150.000)',
  '{rekening}': '🏦 BCA\n1234567890\na.n. TOKO TEST',
  '{wa_admin}': '628111222333',
  '{alamat}': 'Jl. Mawar No. 5 RT 02 RW 01, Bandung, Jawa Barat, 40123',
  '{etd}': '2-3',
  '{kurir}': 'JNE',
  '{resi}': '0987654321',
  '{nama_toko}': 'Toko Test',
  '{invoice_url}': 'https://hulao.id/invoice/INV-TEST-001',
}

function previewMessage(template: string): string {
  let out = template
  for (const [key, val] of Object.entries(DUMMY_PREVIEW)) {
    out = out.split(key).join(val)
  }
  return out
}

interface Template {
  id: string
  name: string
  trigger: string
  paymentMethod: string | null
  applyOnPaymentStatus: string | null
  applyOnDeliveryStatus: string | null
  delayDays: number
  message: string
  isActive: boolean
  isDefault: boolean
  scope: string
  orderFormId: string | null
  order: number
}

interface FormItem {
  id: string
  name: string
}

const NULL_VALUE = '__NULL__'

export function TemplatesClient({ forms }: { forms: FormItem[] }) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Template | null>(null)
  const [creating, setCreating] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
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
      if (!json.success) alert(json.error)
      else {
        setLoading(true)
        reload()
      }
    } finally {
      setActionId(null)
    }
  }

  async function handleDelete(t: Template) {
    if (!confirm(`Hapus template "${t.name}"?`)) return
    setActionId(t.id)
    try {
      const res = await fetch(`/api/followup/templates/${t.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!json.success) alert(json.error)
      else {
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
      if (!json.success) alert(json.error)
      else
        alert(
          `Test terkirim ke ${json.data.to}.\n\nPreview:\n${json.data.preview}`,
        )
    } finally {
      setActionId(null)
    }
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Template Follow-Up</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 size-4" /> Tambah Template
        </Button>
      </div>

      {loading ? (
        <Loader2 className="mx-auto size-6 animate-spin" />
      ) : error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <div className="space-y-6">
          {TRIGGERS.map((trigger) => {
            const items = grouped.get(trigger.value) ?? []
            return (
              <section key={trigger.value}>
                <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">
                  ━━━ {trigger.label} ━━━
                </h2>
                {items.length === 0 ? (
                  <p className="text-sm italic text-muted-foreground">
                    (belum ada — klik Tambah Template untuk buat)
                  </p>
                ) : (
                  <div className="space-y-2">
                    {items.map((t) => (
                      <Card
                        key={t.id}
                        className={t.isActive ? '' : 'opacity-60'}
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
                              {t.scope === 'FORM' && (
                                <Badge variant="outline">PER-FORM</Badge>
                              )}
                              {t.delayDays > 0 && (
                                <Badge variant="outline">
                                  +{t.delayDays} hari
                                </Badge>
                              )}
                            </div>
                            {(t.applyOnPaymentStatus ||
                              t.applyOnDeliveryStatus) && (
                              <p className="text-xs text-muted-foreground">
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
                              onClick={() => handleDelete(t)}
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
    </div>
  )
}

function TemplateModal({
  template,
  forms,
  onClose,
  onSaved,
}: {
  template: Template | null
  forms: FormItem[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [trigger, setTrigger] = useState<string>(
    template?.trigger ?? 'ORDER_CREATED',
  )
  const [paymentMethod, setPaymentMethod] = useState<string>(
    template?.paymentMethod ?? NULL_VALUE,
  )
  const [applyOnPayment, setApplyOnPayment] = useState<string>(
    template?.applyOnPaymentStatus ?? NULL_VALUE,
  )
  const [applyOnDelivery, setApplyOnDelivery] = useState<string>(
    template?.applyOnDeliveryStatus ?? NULL_VALUE,
  )
  const [delayDays, setDelayDays] = useState(template?.delayDays ?? 0)
  const [message, setMessage] = useState(template?.message ?? '')
  const [scope, setScope] = useState<'GLOBAL' | 'FORM'>(
    (template?.scope as 'GLOBAL' | 'FORM') ?? 'GLOBAL',
  )
  const [orderFormId, setOrderFormId] = useState<string>(
    template?.orderFormId ?? '',
  )
  const [isActive, setIsActive] = useState(template?.isActive ?? true)
  const [showPreview, setShowPreview] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const isDaysAfter = trigger.startsWith('DAYS_AFTER')

  function insertVariable(v: string) {
    setMessage((prev) => prev + v)
  }

  async function handleSave() {
    setSubmitting(true)
    try {
      const payload = {
        name,
        trigger,
        paymentMethod: paymentMethod === NULL_VALUE ? null : paymentMethod,
        applyOnPaymentStatus:
          applyOnPayment === NULL_VALUE ? null : applyOnPayment,
        applyOnDeliveryStatus:
          applyOnDelivery === NULL_VALUE ? null : applyOnDelivery,
        delayDays: isDaysAfter ? delayDays : 0,
        message,
        scope,
        orderFormId: scope === 'FORM' ? orderFormId : null,
        isActive,
      }

      const url = template
        ? `/api/followup/templates/${template.id}`
        : '/api/followup/templates'
      const method = template ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.success) {
        alert(json.error ?? 'Gagal simpan')
      } else {
        onSaved()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template ? 'Edit Template' : 'Tambah Template'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Nama Template</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <Label>Trigger</Label>
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGERS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isDaysAfter && (
            <div>
              <Label>Berapa Hari Setelah Event (max 30)</Label>
              <Input
                type="number"
                min={0}
                max={30}
                value={delayDays}
                onChange={(e) =>
                  setDelayDays(Math.max(0, Math.min(30, Number(e.target.value))))
                }
              />
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Untuk Cara Bayar</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NULL_VALUE}>Semua</SelectItem>
                  <SelectItem value="COD">COD only</SelectItem>
                  <SelectItem value="TRANSFER">Transfer only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Berlaku Untuk</Label>
              <Select
                value={scope}
                onValueChange={(v) => setScope(v as 'GLOBAL' | 'FORM')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GLOBAL">Semua form</SelectItem>
                  <SelectItem value="FORM">Form tertentu</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Filter Payment Status (opsional)</Label>
              <Select value={applyOnPayment} onValueChange={setApplyOnPayment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NULL_VALUE}>Tidak filter</SelectItem>
                  {PAYMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Filter Delivery Status (opsional)</Label>
              <Select
                value={applyOnDelivery}
                onValueChange={setApplyOnDelivery}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NULL_VALUE}>Tidak filter</SelectItem>
                  {DELIVERY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {scope === 'FORM' && (
            <div>
              <Label>Pilih Form</Label>
              <Select value={orderFormId} onValueChange={setOrderFormId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih form" />
                </SelectTrigger>
                <SelectContent>
                  {forms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Pesan WhatsApp</Label>
            <Textarea
              rows={10}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {VARIABLES.map((v) => (
                <Button
                  key={v}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => insertVariable(v)}
                >
                  {v}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPreview((s) => !s)}
            >
              <Eye className="mr-1 size-4" />
              {showPreview ? 'Sembunyikan' : 'Tampilkan'} Preview
            </Button>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Aktifkan template</Label>
            </div>
          </div>

          {showPreview && (
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
              {previewMessage(message) || '(kosong)'}
            </pre>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              submitting ||
              name.trim().length < 2 ||
              message.trim().length < 1 ||
              (scope === 'FORM' && !orderFormId)
            }
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
