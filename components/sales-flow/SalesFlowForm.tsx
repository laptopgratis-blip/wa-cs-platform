'use client'

// Editor flow — dipakai untuk:
// 1) Buat baru dari template (mode='create-from-template') — POST.
// 2) Edit flow existing (mode='edit') — PATCH.
//
// UI sengaja "form linear" (bukan multi-step) supaya gampang dibandingkan +
// di-scroll sekaligus saat user awam pertama kali nyoba template.
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import type {
  SalesFlowListItem,
  TemplatePreview,
} from '@/components/sales-flow/SalesFlowList'
import { Badge } from '@/components/ui/badge'
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
  type SalesFlowFinalActionInput,
  type SalesFlowStepInput,
} from '@/lib/validations/sales-flow'

type Source =
  | { kind: 'edit'; flow: SalesFlowListItem }
  | { kind: 'template'; template: TemplatePreview }

interface Props {
  mode: 'edit' | 'create-from-template'
  source: Source
  onDone: () => void
}

const VALIDATION_OPTIONS: Array<{
  value: string
  label: string
}> = [
  { value: 'NONE', label: 'Bebas (apa saja)' },
  { value: 'min_words:2', label: 'Minimal 2 kata (untuk nama)' },
  { value: 'min_words:3', label: 'Minimal 3 kata' },
  { value: 'phone', label: 'Nomor HP (8-15 digit)' },
  { value: 'address', label: 'Alamat lengkap (≥15 karakter)' },
  { value: 'yes_no', label: 'Ya / Tidak' },
]

function validationToSelectValue(v: SalesFlowStepInput['validation']): string {
  return v ?? 'NONE'
}

function selectValueToValidation(v: string): SalesFlowStepInput['validation'] {
  if (v === 'NONE') return null
  return v as SalesFlowStepInput['validation']
}

export function SalesFlowForm({ mode, source, onDone }: Props) {
  const router = useRouter()
  const isEdit = mode === 'edit'

  // Initial state diambil dari source.
  const seed =
    source.kind === 'edit'
      ? {
          name: source.flow.name,
          description: source.flow.description ?? '',
          triggerKeywords: source.flow.triggerKeywords,
          steps: source.flow.steps,
          finalAction: source.flow.finalAction,
          isActive: source.flow.isActive,
          template: source.flow.template,
        }
      : {
          name: source.template.name,
          description: source.template.description,
          triggerKeywords: source.template.triggerKeywords,
          steps: source.template.steps,
          finalAction: source.template.finalAction,
          isActive: true,
          template: source.template.template,
        }

  const [name, setName] = useState(seed.name)
  const [description, setDescription] = useState(seed.description)
  const [keywords, setKeywords] = useState<string[]>(seed.triggerKeywords)
  const [keywordDraft, setKeywordDraft] = useState('')
  const [steps, setSteps] = useState<SalesFlowStepInput[]>(seed.steps)
  const [finalAction, setFinalAction] = useState<SalesFlowFinalActionInput>(
    seed.finalAction,
  )
  const [isActive, setIsActive] = useState(seed.isActive)

  const [isSubmitting, setSubmitting] = useState(false)
  const [isDeleting, setDeleting] = useState(false)

  const showBankInfo = seed.template === 'TRANSFER'

  function addKeyword(raw: string) {
    const v = raw.trim().toLowerCase()
    if (v.length < 2 || v.length > 40) return
    if (keywords.includes(v)) return
    if (keywords.length >= 20) {
      toast.error('Maksimal 20 kata kunci')
      return
    }
    setKeywords((k) => [...k, v])
    setKeywordDraft('')
  }

  function updateStep(index: number, patch: Partial<SalesFlowStepInput>) {
    setSteps((s) =>
      s.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    )
  }

  function removeStep(index: number) {
    setSteps((s) => s.filter((_, i) => i !== index))
  }

  function addStep() {
    if (steps.length >= 10) {
      toast.error('Maksimal 10 pertanyaan')
      return
    }
    setSteps((s) => [
      ...s,
      {
        fieldName: `field${s.length + 1}`,
        question: '',
        validation: null,
      },
    ])
  }

  async function handleSubmit() {
    if (name.trim().length < 2) {
      toast.error('Nama minimal 2 karakter')
      return
    }
    if (finalAction.replyMessage.trim().length < 2) {
      toast.error('Pesan balasan akhir tidak boleh kosong')
      return
    }
    // Validasi step minimal — tiap step harus punya pertanyaan + fieldName.
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]!
      if (!s.fieldName || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(s.fieldName)) {
        toast.error(`Pertanyaan #${i + 1}: kode field harus huruf+angka`)
        return
      }
      if (!s.question || s.question.trim().length < 2) {
        toast.error(`Pertanyaan #${i + 1}: tulis isinya dulu`)
        return
      }
    }

    setSubmitting(true)
    try {
      let url = ''
      let method: 'POST' | 'PATCH' = 'POST'
      let body: Record<string, unknown> = {}

      if (isEdit && source.kind === 'edit') {
        url = `/api/sales-flows/${source.flow.id}`
        method = 'PATCH'
        body = {
          name: name.trim(),
          description: description.trim() || null,
          triggerKeywords: keywords,
          steps,
          finalAction,
          isActive,
        }
      } else {
        url = '/api/sales-flows'
        method = 'POST'
        body = {
          template: seed.template,
          name: name.trim(),
          description: description.trim() || null,
          triggerKeywords: keywords,
          steps,
          finalAction,
          isActive,
        }
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; error?: string }
        | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Gagal menyimpan flow')
        return
      }
      toast.success(isEdit ? 'Flow diperbarui' : 'Flow dibuat')
      router.refresh()
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (source.kind !== 'edit') return
    if (!confirm('Yakin hapus flow ini? Sesi pesanan yang sedang berjalan ikut terhapus.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/sales-flows/${source.flow.id}`, {
        method: 'DELETE',
      })
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; error?: string }
        | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Gagal menghapus flow')
        return
      }
      toast.success('Flow dihapus')
      router.refresh()
      onDone()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 py-2">
      {/* Bagian dasar */}
      <div className="space-y-2">
        <Label htmlFor="sf-name">Nama flow</Label>
        <Input
          id="sf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Misal: Pengiriman COD"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sf-desc">Deskripsi (opsional)</Label>
        <Textarea
          id="sf-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Catatan singkat untuk diri sendiri."
        />
      </div>

      {/* Trigger keywords */}
      <div className="space-y-2 border-t pt-4">
        <Label>Kata kunci pemicu</Label>
        <p className="text-xs text-muted-foreground">
          AI akan jalankan flow ini saat customer ucap kata-kata berikut.
        </p>
        <div className="flex flex-wrap gap-1.5 rounded-lg border bg-warm-50/40 p-2 dark:bg-warm-950/20">
          {keywords.map((kw) => (
            <Badge key={kw} variant="secondary" className="gap-1 font-normal">
              {kw}
              <button
                type="button"
                onClick={() => setKeywords((k) => k.filter((x) => x !== kw))}
                className="rounded hover:bg-warm-200 dark:hover:bg-warm-800"
                aria-label={`Hapus ${kw}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {keywords.length === 0 && (
            <span className="px-1 text-xs text-muted-foreground">
              Belum ada kata kunci
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Ketik lalu Enter (mis. cod, transfer)"
            value={keywordDraft}
            onChange={(e) => setKeywordDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addKeyword(keywordDraft)
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => addKeyword(keywordDraft)}
            disabled={keywordDraft.trim().length < 2}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Pertanyaan AI ke customer</Label>
            <p className="text-xs text-muted-foreground">
              AI akan tanya satu per satu sesuai urutan ini.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addStep}
            disabled={steps.length >= 10}
          >
            <Plus className="mr-1 size-4" />
            Tambah pertanyaan
          </Button>
        </div>

        {steps.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Belum ada pertanyaan. Klik "Tambah pertanyaan" untuk mulai.
          </p>
        ) : (
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div
                key={i}
                className="rounded-lg border p-3 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Pertanyaan #{i + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeStep(i)}
                    aria-label="Hapus pertanyaan"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`q-${i}`} className="text-xs">
                    Pertanyaan
                  </Label>
                  <Textarea
                    id={`q-${i}`}
                    rows={3}
                    value={step.question}
                    onChange={(e) =>
                      updateStep(i, { question: e.target.value })
                    }
                    placeholder="Contoh: Boleh tahu nama lengkapnya kak?"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`fn-${i}`} className="text-xs">
                      Kode field (untuk admin)
                    </Label>
                    <Input
                      id={`fn-${i}`}
                      value={step.fieldName}
                      onChange={(e) =>
                        updateStep(i, { fieldName: e.target.value })
                      }
                      placeholder="customerName"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cek otomatis</Label>
                    <Select
                      value={validationToSelectValue(step.validation)}
                      onValueChange={(v) =>
                        updateStep(i, {
                          validation: selectValueToValidation(v),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VALIDATION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Final action */}
      <div className="space-y-3 border-t pt-4">
        <Label>Setelah selesai, AI akan:</Label>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label className="text-sm">Kirim notif ke admin</Label>
            <p className="text-xs text-muted-foreground">
              Pesan WhatsApp otomatis ke nomor admin saat pesanan masuk.
            </p>
          </div>
          <Switch
            checked={finalAction.notifyAdmin}
            onCheckedChange={(v) =>
              setFinalAction((s) => ({ ...s, notifyAdmin: v }))
            }
          />
        </div>

        {finalAction.notifyAdmin && (
          <div className="space-y-1">
            <Label htmlFor="sf-admin-phone" className="text-xs">
              Nomor admin (mis. 08123456789 atau 628123456789)
            </Label>
            <Input
              id="sf-admin-phone"
              value={finalAction.adminPhone}
              onChange={(e) =>
                setFinalAction((s) => ({ ...s, adminPhone: e.target.value }))
              }
              placeholder="08123456789"
            />
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="sf-reply" className="text-xs">
            Balasan ke customer
          </Label>
          <Textarea
            id="sf-reply"
            rows={3}
            value={finalAction.replyMessage}
            onChange={(e) =>
              setFinalAction((s) => ({ ...s, replyMessage: e.target.value }))
            }
            placeholder="Pesanan dicatat ya kak {customerName}..."
          />
          <p className="text-xs text-muted-foreground">
            Boleh pakai placeholder seperti{' '}
            <code className="text-[10px]">{'{customerName}'}</code>,{' '}
            <code className="text-[10px]">{'{customerAddress}'}</code> — diganti
            otomatis dari jawaban customer.
          </p>
        </div>

        {showBankInfo && (
          <div className="space-y-2 rounded-lg border bg-warm-50/40 p-3 dark:bg-warm-950/20">
            <Label className="text-sm">Info rekening transfer</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                placeholder="Bank (BCA, Mandiri, dll)"
                value={finalAction.bankInfo?.bankName ?? ''}
                onChange={(e) =>
                  setFinalAction((s) => ({
                    ...s,
                    bankInfo: {
                      bankName: e.target.value,
                      accountNumber: s.bankInfo?.accountNumber ?? '',
                      accountName: s.bankInfo?.accountName ?? '',
                    },
                  }))
                }
              />
              <Input
                placeholder="Nomor rekening"
                value={finalAction.bankInfo?.accountNumber ?? ''}
                onChange={(e) =>
                  setFinalAction((s) => ({
                    ...s,
                    bankInfo: {
                      bankName: s.bankInfo?.bankName ?? '',
                      accountNumber: e.target.value,
                      accountName: s.bankInfo?.accountName ?? '',
                    },
                  }))
                }
              />
              <Input
                placeholder="Atas nama"
                value={finalAction.bankInfo?.accountName ?? ''}
                onChange={(e) =>
                  setFinalAction((s) => ({
                    ...s,
                    bankInfo: {
                      bankName: s.bankInfo?.bankName ?? '',
                      accountNumber: s.bankInfo?.accountNumber ?? '',
                      accountName: e.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Toggle aktif */}
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label>Status flow</Label>
          <p className="text-xs text-muted-foreground">
            Saat aktif, AI akan otomatis jalankan flow ini ke customer yang
            cocok kata kunci.
          </p>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>

      {/* Tombol */}
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
              Hapus Flow
            </Button>
          )}
        </div>
        <div className="flex gap-2 sm:justify-end">
          <Button type="button" variant="ghost" onClick={onDone}>
            Batal
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isEdit ? 'Simpan Perubahan' : 'Aktifkan Flow'}
          </Button>
        </div>
      </div>
    </div>
  )
}
