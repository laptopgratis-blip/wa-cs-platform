'use client'

// Form buat broadcast: pilih WA session, pesan, target (tags & stages),
// jadwal. Live preview jumlah penerima.
// Sesi Baileys: pesan bebas dengan {nama}/{nomor}.
// Sesi Cloud API (Trek 2B): pilih template Meta APPROVED + parameter
// (boleh {nama}/{nomor}) + preview + estimasi Kredit Pesan vs saldo.
import type { PipelineStage } from '@prisma/client'
import { BadgeCheck, Calendar, Loader2, Send, Users } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TemplateParamsFields, emptyParamsFor, paramsComplete } from '@/components/waba-templates/TemplateParamsFields'
import { TemplatePreview } from '@/components/waba-templates/TemplatePreview'
import { CATEGORY_LABEL, type TemplateSendParamsDto, type WabaTemplateDto } from '@/components/waba-templates/types'
import { PIPELINE_LABELS } from '@/lib/validations/contact'

import type { SessionOption } from './types'

interface BroadcastFormProps {
  sessions: SessionOption[]
  availableTags: string[]
  onCreated: () => void
}

const STAGES: PipelineStage[] = [
  'NEW',
  'PROSPECT',
  'INTEREST',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
]

const DEFAULT_MESSAGE = 'Halo {nama}, ada promo spesial buat kamu hari ini! Klik untuk info lebih lanjut.'

interface PreviewInfo {
  count: number
  excludedOptOut: number
  estimatedCreditRp: number
  balanceRp: number | null
}

export function BroadcastForm({
  sessions,
  availableTags,
  onCreated,
}: BroadcastFormProps) {
  const [name, setName] = useState('')
  const [waSessionId, setWaSessionId] = useState<string>(sessions[0]?.id ?? '')
  const [message, setMessage] = useState(DEFAULT_MESSAGE)
  const [tags, setTags] = useState<string[]>([])
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [scheduleNow, setScheduleNow] = useState(true)
  const [scheduledAt, setScheduledAt] = useState('')
  const [preview, setPreview] = useState<PreviewInfo | null>(null)
  const [isPreviewing, setPreviewing] = useState(false)
  const [isSubmitting, setSubmitting] = useState(false)

  // Cloud API
  const [templates, setTemplates] = useState<WabaTemplateDto[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [templateParams, setTemplateParams] = useState<TemplateSendParamsDto>({ body: [] })

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const session = useMemo(() => sessions.find((s) => s.id === waSessionId) ?? null, [sessions, waSessionId])
  const isCloud = session?.provider === 'CLOUD_API'
  const template = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templates, templateId])

  // Muat template APPROVED saat sesi Cloud dipilih.
  useEffect(() => {
    if (!isCloud || !waSessionId) return
    let cancelled = false
    const t = window.setTimeout(() => {
      setTemplatesLoading(true)
      fetch(`/api/whatsapp/templates?sessionId=${encodeURIComponent(waSessionId)}&status=APPROVED`)
        .then((r) => r.json() as Promise<{ success: boolean; data?: { templates: WabaTemplateDto[] } }>)
        .then((json) => {
          if (cancelled) return
          const list = json.success && json.data ? json.data.templates : []
          setTemplates(list)
          setTemplateId((cur) => (list.some((x) => x.id === cur) ? cur : list[0]?.id ?? ''))
        })
        .finally(() => {
          if (!cancelled) setTemplatesLoading(false)
        })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [isCloud, waSessionId])

  // Reset param saat template berganti.
  useEffect(() => {
    if (!template) return
    const t = window.setTimeout(() => setTemplateParams(emptyParamsFor(template)), 0)
    return () => window.clearTimeout(t)
  }, [template])

  const formValid = useMemo(
    () =>
      name.trim().length >= 2 &&
      Boolean(waSessionId) &&
      (isCloud ? Boolean(template) && paramsComplete(template!, templateParams) : message.trim().length > 0) &&
      (tags.length > 0 || stages.length > 0),
    [name, waSessionId, isCloud, template, templateParams, message, tags, stages],
  )

  // Preview jumlah penerima — debounced 400ms.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!waSessionId || (tags.length === 0 && stages.length === 0)) {
      setPreview(null)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setPreviewing(true)
      try {
        const params = new URLSearchParams({ waSessionId })
        if (tags.length > 0) params.set('tags', tags.join(','))
        if (stages.length > 0) params.set('stages', stages.join(','))
        if (isCloud && templateId) params.set('templateId', templateId)
        const res = await fetch(`/api/broadcast/preview?${params}`)
        const json = (await res.json()) as { success: boolean; data?: PreviewInfo }
        if (json.success && json.data) setPreview(json.data)
      } finally {
        setPreviewing(false)
      }
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [waSessionId, tags, stages, isCloud, templateId])

  function toggleTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }
  function toggleStage(s: PipelineStage) {
    setStages((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  async function submit() {
    setSubmitting(true)
    try {
      const body = {
        name: name.trim(),
        waSessionId,
        message: isCloud ? '' : message.trim(),
        templateId: isCloud ? templateId : null,
        templateParams: isCloud ? templateParams : null,
        targetTags: tags,
        targetStages: stages,
        scheduledAt:
          !scheduleNow && scheduledAt
            ? new Date(scheduledAt).toISOString()
            : null,
      }
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as {
        success: boolean
        error?: string
        data?: { id: string }
      }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal membuat broadcast')
        return
      }
      toast.success('Broadcast dibuat')
      onCreated()
      // Reset form
      setName('')
      setMessage(DEFAULT_MESSAGE)
      setTags([])
      setStages([])
      setScheduleNow(true)
      setScheduledAt('')
      if (template) setTemplateParams(emptyParamsFor(template))
    } finally {
      setSubmitting(false)
    }
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-md border bg-muted/40 p-6 text-sm text-muted-foreground">
        Hubungkan minimal satu WhatsApp di menu <strong>WhatsApp</strong> dulu sebelum
        bikin broadcast.
      </div>
    )
  }

  const insufficient =
    isCloud && preview && preview.balanceRp !== null && preview.estimatedCreditRp > preview.balanceRp

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h3 className="font-semibold">Buat Broadcast Baru</h3>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bc-name">Nama Broadcast</Label>
          <Input
            id="bc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Misalnya: Promo Lebaran 2026"
          />
        </div>
        <div className="space-y-2">
          <Label>Kirim dari WhatsApp</Label>
          <Select value={waSessionId} onValueChange={setWaSessionId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.displayName || `+${s.phoneNumber ?? '???'}`}
                  {s.provider === 'CLOUD_API' ? ' · Cloud API' : ''}
                  {s.status !== 'CONNECTED' && ' (offline)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isCloud ? (
        <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
          <p className="flex items-center gap-1.5 text-xs text-emerald-900">
            <BadgeCheck className="size-3.5" /> Nomor resmi Meta: broadcast wajib memakai <b>template yang disetujui</b>;
            biaya per pesan dipotong dari Kredit Pesan WA. Kelola template di{' '}
            <Link href={`/whatsapp/templates?session=${waSessionId}`} className="underline">Template Meta</Link>.
          </p>
          {templatesLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat template…</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada template APPROVED untuk nomor ini. Buat/siapkan dulu di Template Meta dan tunggu review Meta.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-[1fr_280px]">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Template</Label>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger><SelectValue placeholder="Pilih template" /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} · {CATEGORY_LABEL[t.category]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {template?.category === 'MARKETING' && (
                    <p className="text-[11px] text-amber-700">
                      MARKETING: kontak yang memilih berhenti menerima promo (opt-out) otomatis dikecualikan; harga per pesan lebih tinggi.
                    </p>
                  )}
                </div>
                {template && (
                  <TemplateParamsFields
                    template={template}
                    value={templateParams}
                    onChange={setTemplateParams}
                    placeholders={[
                      { label: '{nama}', value: '{nama}' },
                      { label: '{nomor}', value: '{nomor}' },
                    ]}
                  />
                )}
              </div>
              {template && (
                <TemplatePreview
                  template={template}
                  params={{
                    ...templateParams,
                    body: templateParams.body.map((v) => v.replaceAll('{nama}', 'Budi').replaceAll('{nomor}', '62812xxxx')),
                  }}
                />
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="bc-msg">Pesan</Label>
          <Textarea
            id="bc-msg"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tulis pesan broadcast..."
          />
          <p className="text-xs text-muted-foreground">
            Variabel yang bisa dipakai: <code>{'{nama}'}</code> (nama kontak) dan{' '}
            <code>{'{nomor}'}</code> (nomor kontak).
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Target — Tags</Label>
          {availableTags.length === 0 ? (
            <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              Belum ada kontak yang punya tag. Tambahkan tag di halaman Contacts.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 rounded-md border p-3">
              {availableTags.map((t) => (
                <label
                  key={t}
                  className="flex cursor-pointer items-center gap-1.5 text-sm"
                >
                  <Checkbox
                    checked={tags.includes(t)}
                    onCheckedChange={() => toggleTag(t)}
                  />
                  {t}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Target — Pipeline Stage</Label>
          <div className="flex flex-wrap gap-2 rounded-md border p-3">
            {STAGES.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <Checkbox
                  checked={stages.includes(s)}
                  onCheckedChange={() => toggleStage(s)}
                />
                {PIPELINE_LABELS[s]}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <span>Akan dikirim ke</span>
          <strong>
            {isPreviewing ? '...' : preview === null ? '—' : `${preview.count} kontak`}
          </strong>
          {preview && preview.excludedOptOut > 0 && (
            <span className="text-xs text-muted-foreground">({preview.excludedOptOut} opt-out dikecualikan)</span>
          )}
        </div>
        {isCloud && preview && preview.balanceRp !== null && (
          <p className={insufficient ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
            Estimasi kredit ± Rp {preview.estimatedCreditRp.toLocaleString('id-ID')} · saldo Rp{' '}
            {preview.balanceRp.toLocaleString('id-ID')}
            {insufficient ? ' — kurang, top up dulu di Billing' : ''}
            {template?.category === 'UTILITY' ? ' · utility gratis bila kontak masih dalam window 24 jam' : ''}
          </p>
        )}
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="bc-now"
            checked={scheduleNow}
            onCheckedChange={(v) => setScheduleNow(Boolean(v))}
          />
          <Label htmlFor="bc-now" className="cursor-pointer">
            Kirim sekarang (langsung jalan setelah klik tombol)
          </Label>
        </div>
        {!scheduleNow && (
          <div className="space-y-1">
            <Label htmlFor="bc-sched" className="flex items-center gap-1 text-xs">
              <Calendar className="size-3" /> Jadwalkan
            </Label>
            <Input
              id="bc-sched"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
        )}
      </div>

      <Button onClick={submit} disabled={!formValid || isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Send className="mr-2 size-4" />
        )}
        {scheduleNow ? 'Buat & Kirim' : 'Jadwalkan'}
      </Button>
    </div>
  )
}
