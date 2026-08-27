'use client'

// Dialog buat/edit template Meta. Validasi client via template-validate
// (pure) — error sama persis dengan server. Simpan draft lokal atau langsung
// submit ke Meta. Edit template yang sudah di Meta → nama/bahasa terkunci,
// hasil edit masuk review lagi (PENDING).
import { AlertTriangle, Check, Loader2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  countPlaceholders,
  slugifyTemplateName,
  validateTemplateDraft,
  type TemplateDraftInput,
} from '@/lib/services/waba/template-validate'
import type { WabaTemplateButton } from '@/lib/services/waba/types'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

import { TemplateButtonsEditor } from './TemplateButtonsEditor'
import { TemplatePreview } from './TemplatePreview'
import {
  CATEGORY_HINT,
  CATEGORY_LABEL,
  LANGUAGE_OPTIONS,
  type TemplateCategory,
  type TemplateHeaderType,
  type WabaTemplateDto,
} from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  template?: WabaTemplateDto | null
  onSaved: () => void
}

interface DraftState {
  name: string
  language: string
  category: TemplateCategory
  headerType: TemplateHeaderType | ''
  headerText: string
  headerTextExample: string
  headerMediaHandle: string
  headerMediaUrl: string
  bodyText: string
  bodyExamples: string[]
  footerText: string
  buttons: WabaTemplateButton[]
  authAddSecurityRecommendation: boolean
  authCodeExpirationMinutes: string
}

const EMPTY: DraftState = {
  name: '',
  language: 'id',
  category: 'UTILITY',
  headerType: '',
  headerText: '',
  headerTextExample: '',
  headerMediaHandle: '',
  headerMediaUrl: '',
  bodyText: '',
  bodyExamples: [],
  footerText: '',
  buttons: [],
  authAddSecurityRecommendation: true,
  authCodeExpirationMinutes: '5',
}

function fromTemplate(t: WabaTemplateDto): DraftState {
  return {
    name: t.name,
    language: t.language,
    category: t.category,
    headerType: (t.headerType as TemplateHeaderType | null) ?? '',
    headerText: t.headerText ?? '',
    headerTextExample: t.headerTextExample ?? '',
    headerMediaHandle: t.headerMediaHandle ?? '',
    headerMediaUrl: t.headerMediaUrl ?? '',
    bodyText: t.bodyText ?? '',
    bodyExamples: t.bodyExamples ?? [],
    footerText: t.footerText ?? '',
    buttons: Array.isArray(t.buttons) ? t.buttons : [],
    authAddSecurityRecommendation: t.authAddSecurityRecommendation ?? true,
    authCodeExpirationMinutes: t.authCodeExpirationMinutes ? String(t.authCodeExpirationMinutes) : '5',
  }
}

function toDraftInput(d: DraftState): TemplateDraftInput {
  const isAuth = d.category === 'AUTHENTICATION'
  return {
    name: d.name,
    language: d.language,
    category: d.category,
    headerType: isAuth || !d.headerType ? null : d.headerType,
    headerText: d.headerType === 'TEXT' ? d.headerText : null,
    headerTextExample: d.headerType === 'TEXT' ? d.headerTextExample || null : null,
    headerMediaHandle: d.headerType && d.headerType !== 'TEXT' ? d.headerMediaHandle || null : null,
    headerMediaUrl: d.headerType && d.headerType !== 'TEXT' ? d.headerMediaUrl || null : null,
    bodyText: isAuth ? '' : d.bodyText,
    bodyExamples: isAuth ? [] : d.bodyExamples.slice(0, countPlaceholders(d.bodyText)),
    footerText: isAuth ? null : d.footerText || null,
    buttons: isAuth ? [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Salin Kode' }] : d.buttons,
    authAddSecurityRecommendation: d.authAddSecurityRecommendation,
    authCodeExpirationMinutes: isAuth && d.authCodeExpirationMinutes ? Number(d.authCodeExpirationMinutes) : null,
  }
}

export function TemplateEditorDialog({ open, onOpenChange, sessionId, template, onSaved }: Props) {
  const [draft, setDraft] = useState<DraftState>(EMPTY)
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isEdit = Boolean(template)
  const remote = Boolean(template?.metaTemplateId) && template?.status !== 'DRAFT'

  useEffect(() => {
    if (!open) return
    // Reset form saat dibuka — tick berikutnya (react-hooks/set-state-in-effect).
    const t = window.setTimeout(() => {
      setDraft(template ? fromTemplate(template) : EMPTY)
      setSubmitError(null)
    }, 0)
    return () => window.clearTimeout(t)
  }, [open, template])

  const draftInput = useMemo(() => toDraftInput(draft), [draft])
  const validation = useMemo(() => validateTemplateDraft(draftInput), [draftInput])
  const isAuth = draft.category === 'AUTHENTICATION'
  const varCount = countPlaceholders(draft.bodyText)

  const set = <K extends keyof DraftState>(k: K, v: DraftState[K]) => setDraft((d) => ({ ...d, [k]: v }))

  function addVariable() {
    const next = varCount + 1
    set('bodyText', `${draft.bodyText}${draft.bodyText.endsWith(' ') || !draft.bodyText ? '' : ' '}{{${next}}}`)
  }

  async function uploadMedia(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('sessionId', sessionId)
      fd.append('file', file)
      const res = await fetch('/api/whatsapp/templates/media', { method: 'POST', body: fd })
      const json = (await res.json()) as { success: boolean; data?: { handle: string; publicUrl: string; kind: string }; error?: string }
      if (!json.success || !json.data) {
        toast.error(json.error ?? 'Upload gagal')
        return
      }
      setDraft((d) => ({
        ...d,
        headerMediaHandle: json.data!.handle,
        headerMediaUrl: json.data!.publicUrl,
        headerType: json.data!.kind as TemplateHeaderType,
      }))
      toast.success('File contoh terunggah ke Meta')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function save(mode: 'draft' | 'submit') {
    if (!validation.ok) {
      toast.error(validation.errors[0])
      return
    }
    setSaving(mode)
    setSubmitError(null)
    try {
      let res: Response
      if (isEdit && template) {
        res = await fetch(`/api/whatsapp/templates/${template.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft: draftInput }),
        })
        const json = (await res.json()) as { success: boolean; error?: string; data?: { template: WabaTemplateDto } }
        if (!json.success) {
          toast.error(json.error ?? 'Gagal menyimpan')
          return
        }
        if (mode === 'submit' && json.data?.template.status === 'DRAFT') {
          const sub = await fetch(`/api/whatsapp/templates/${template.id}/submit`, { method: 'POST' })
          const sj = (await sub.json()) as { success: boolean; error?: string }
          if (!sj.success) {
            setSubmitError(sj.error ?? 'Submit gagal')
            onSaved()
            return
          }
        }
        toast.success(remote ? 'Perubahan dikirim ke Meta — menunggu review' : 'Template disimpan')
      } else {
        res = await fetch(`/api/whatsapp/templates${mode === 'submit' ? '?submit=1' : ''}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, draft: draftInput }),
        })
        const json = (await res.json()) as {
          success: boolean
          error?: string
          data?: { template: WabaTemplateDto; submitError?: string }
        }
        if (!json.success) {
          toast.error(json.error ?? 'Gagal menyimpan')
          return
        }
        if (json.data?.submitError) {
          setSubmitError(json.data.submitError)
          onSaved()
          return
        }
        toast.success(mode === 'submit' ? 'Template dikirim ke Meta — menunggu review' : 'Draft disimpan')
      }
      onSaved()
      onOpenChange(false)
    } finally {
      setSaving(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!saving ? onOpenChange(o) : undefined)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Template Meta' : 'Buat Template Meta'}</DialogTitle>
          <DialogDescription>
            {remote
              ? 'Template ini sudah ada di Meta — nama & bahasa terkunci; perubahan isi akan direview ulang.'
              : 'Template direview Meta (biasanya beberapa menit–24 jam). Isi contoh variabel secara konkret agar lolos review.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="tpl-name">Nama (huruf kecil, _)</Label>
                <Input
                  id="tpl-name"
                  value={draft.name}
                  disabled={remote}
                  onChange={(e) => set('name', slugifyTemplateName(e.target.value))}
                  placeholder="mis. promo_akhir_bulan"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Bahasa</Label>
                <Select value={draft.language} disabled={remote} onValueChange={(v) => set('language', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Select value={draft.category} onValueChange={(v) => set('category', v as TemplateCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CATEGORY_LABEL) as TemplateCategory[]).map((c) => (
                      <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{CATEGORY_HINT[draft.category]}</p>

            {isAuth ? (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <Label>Tambahkan anjuran keamanan (&ldquo;jangan bagikan kode ini&rdquo;)</Label>
                  <Switch checked={draft.authAddSecurityRecommendation} onCheckedChange={(v) => set('authAddSecurityRecommendation', v)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-exp">Masa berlaku kode (menit, 1–90)</Label>
                  <Input
                    id="tpl-exp"
                    type="number"
                    min={1}
                    max={90}
                    value={draft.authCodeExpirationMinutes}
                    onChange={(e) => set('authCodeExpirationMinutes', e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Body, footer, dan tombol &ldquo;Salin Kode&rdquo; dibuat Meta otomatis. Saat kirim, kode OTP disisipkan sebagai parameter.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Header (opsional)</Label>
                  <div className="flex flex-wrap gap-2">
                    <Select
                      value={draft.headerType || 'NONE'}
                      onValueChange={(v) => set('headerType', v === 'NONE' ? '' : (v as TemplateHeaderType))}
                    >
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Tanpa header</SelectItem>
                        <SelectItem value="TEXT">Teks</SelectItem>
                        <SelectItem value="IMAGE">Gambar</SelectItem>
                        <SelectItem value="VIDEO">Video</SelectItem>
                        <SelectItem value="DOCUMENT">Dokumen (PDF)</SelectItem>
                      </SelectContent>
                    </Select>
                    {draft.headerType === 'TEXT' && (
                      <Input
                        className="flex-1"
                        placeholder="Teks header (≤60, boleh {{1}})"
                        maxLength={60}
                        value={draft.headerText}
                        onChange={(e) => set('headerText', e.target.value)}
                      />
                    )}
                    {draft.headerType && draft.headerType !== 'TEXT' && (
                      <>
                        <input
                          ref={fileRef}
                          type="file"
                          className="hidden"
                          accept={draft.headerType === 'IMAGE' ? 'image/jpeg,image/png' : draft.headerType === 'VIDEO' ? 'video/mp4' : 'application/pdf'}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) void uploadMedia(f)
                          }}
                        />
                        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                          {uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                          {draft.headerMediaHandle ? 'Ganti file contoh' : 'Unggah file contoh'}
                        </Button>
                        {draft.headerMediaHandle && (
                          <span
                            className={cn(
                              'flex items-center gap-1 self-center text-xs',
                              TONES.success.text,
                            )}
                          >
                            <Check aria-hidden className="size-3" /> file contoh siap
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {draft.headerType === 'TEXT' && /\{\{\s*1\s*\}\}/.test(draft.headerText) && (
                    <Input
                      placeholder="Contoh nilai {{1}} header"
                      value={draft.headerTextExample}
                      onChange={(e) => set('headerTextExample', e.target.value)}
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="tpl-body">Isi pesan (body) · {draft.bodyText.length}/1024</Label>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addVariable}>
                      + Tambah variabel {'{{'}{varCount + 1}{'}}'}
                    </Button>
                  </div>
                  <Textarea
                    id="tpl-body"
                    rows={6}
                    maxLength={1024}
                    value={draft.bodyText}
                    onChange={(e) => set('bodyText', e.target.value)}
                    placeholder={'Halo {{1}}, pesanan {{2}} sudah kami terima. Balas pesan ini jika butuh bantuan.'}
                  />
                  <p className="text-xs text-muted-foreground">
                    Format WA: *tebal*, _miring_, ~coret~. Variabel berurutan {'{{1}}'}, {'{{2}}'}, … — tidak boleh di awal/akhir.
                  </p>
                </div>

                {varCount > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: varCount }, (_, i) => (
                      <div key={i} className="space-y-1">
                        <Label className="text-xs">Contoh {'{{'}{i + 1}{'}}'} (wajib, konkret)</Label>
                        <Input
                          value={draft.bodyExamples[i] ?? ''}
                          onChange={(e) => {
                            const ex = [...draft.bodyExamples]
                            while (ex.length < varCount) ex.push('')
                            ex[i] = e.target.value
                            set('bodyExamples', ex)
                          }}
                          placeholder={i === 0 ? 'mis. Budi' : 'mis. INV-20260820-001'}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="tpl-footer">Footer (opsional, ≤60)</Label>
                  <Input
                    id="tpl-footer"
                    maxLength={60}
                    value={draft.footerText}
                    onChange={(e) => set('footerText', e.target.value)}
                    placeholder="mis. Balas STOP untuk berhenti menerima promo"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Tombol (opsional)</Label>
                  <TemplateButtonsEditor value={draft.buttons} onChange={(b) => set('buttons', b)} />
                </div>
              </>
            )}

            {(validation.errors.length > 0 || validation.warnings.length > 0 || submitError) && (
              <div className="space-y-1 rounded-lg border p-3 text-xs">
                {submitError && (
                  <p className="flex items-start gap-1.5 text-destructive">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Meta: {submitError}
                  </p>
                )}
                {validation.errors.map((e, i) => (
                  <p key={`e${i}`} className="text-destructive">• {e}</p>
                ))}
                {validation.warnings.map((w, i) => (
                  <p key={`w${i}`} className={TONES.warning.text}>• {w}</p>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Preview</Label>
            <TemplatePreview
              template={{
                category: draft.category,
                headerType: draft.headerType || null,
                headerText: draft.headerText || null,
                headerTextExample: draft.headerTextExample || null,
                headerMediaUrl: draft.headerMediaUrl || null,
                bodyText: draft.bodyText,
                bodyExamples: draft.bodyExamples,
                footerText: draft.footerText || null,
                buttons: isAuth ? [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Salin Kode' }] : draft.buttons,
                authAddSecurityRecommendation: draft.authAddSecurityRecommendation,
                authCodeExpirationMinutes: Number(draft.authCodeExpirationMinutes) || null,
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={Boolean(saving)}>
            Batal
          </Button>
          {!remote && (
            <Button variant="outline" onClick={() => save('draft')} disabled={Boolean(saving) || !validation.ok}>
              {saving === 'draft' && <Loader2 className="mr-2 size-4 animate-spin" />}
              Simpan draft
            </Button>
          )}
          <Button onClick={() => save('submit')} disabled={Boolean(saving) || !validation.ok}>
            {saving === 'submit' && <Loader2 className="mr-2 size-4 animate-spin" />}
            {remote ? 'Simpan & kirim review' : 'Simpan & submit ke Meta'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
