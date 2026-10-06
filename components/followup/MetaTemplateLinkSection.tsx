'use client'

// Pemilih Template Meta untuk follow-up (sesi Cloud API, di luar window 24
// jam) + pemetaan variabel per {{n}} ke placeholder hulao yang sah untuk
// trigger. Template yang tidak didukung follow-up (header bervariabel, tombol
// URL bervariabel, dll) tampil nonaktif dengan alasannya.
import { Loader2 } from 'lucide-react'
import { useMemo } from 'react'

import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TemplatePreview } from '@/components/waba-templates/TemplatePreview'
import {
  STATUS_LABEL,
  STATUS_TONE,
  type WabaTemplateDto,
} from '@/components/waba-templates/types'
import { metaLinkTemplateError } from '@/lib/services/followup-meta-link'
import {
  allowedPlaceholdersForTrigger,
  previewFollowUpText,
} from '@/lib/services/followup-placeholders'
import { expectedBodyParamCount } from '@/lib/services/waba/template-payload'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

import type { MetaTemplateOptions } from './useMetaTemplateOptions'

const NONE = '__NONE__'
const UNSET = '__UNSET__'

export interface MetaLinkValue {
  metaTemplateId: string | null
  paramMap: string[]
}

interface Props {
  trigger: string
  options: MetaTemplateOptions
  value: MetaLinkValue
  onChange: (next: MetaLinkValue) => void
  /** Pesan validasi dari parent (peta belum lengkap, dll). */
  error: string | null
}

/** Peta baru saat template diganti — pertahankan isi lama bila panjang sama. */
function nextParamMap(prev: string[], template: WabaTemplateDto): string[] {
  const n = expectedBodyParamCount(template)
  return prev.length === n
    ? prev
    : Array.from({ length: n }, (_, i) => prev[i] ?? '')
}

export function MetaTemplateLinkSection({
  trigger,
  options,
  value,
  onChange,
  error,
}: Props) {
  const selected =
    options.templates.find((t) => t.id === value.metaTemplateId) ?? null
  const placeholders = allowedPlaceholdersForTrigger(trigger)
  const previewBody = useMemo(
    () => value.paramMap.map((p) => (p ? previewFollowUpText(p) : '')),
    [value.paramMap],
  )

  function selectTemplate(id: string) {
    if (id === NONE) {
      onChange({ metaTemplateId: null, paramMap: [] })
      return
    }
    const tpl = options.templates.find((t) => t.id === id)
    if (!tpl) return
    onChange({
      metaTemplateId: id,
      paramMap: nextParamMap(value.paramMap, tpl),
    })
  }

  function setParam(index: number, placeholder: string) {
    const paramMap = value.paramMap.map((p, i) =>
      i === index ? placeholder : p,
    )
    onChange({ ...value, paramMap })
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label className="text-warm-700 text-sm font-medium">
            Template Meta (WhatsApp Cloud API)
          </Label>
          <p className="text-muted-foreground text-xs">
            Dipakai saat window 24 jam customer sudah tutup. Tanpa template ini,
            follow-up lewat nomor Cloud API di luar window akan gagal.
          </p>
        </div>

        {options.loading ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Memuat…
          </p>
        ) : options.error ? (
          <p className={cn('text-sm', TONES.danger.text)}>{options.error}</p>
        ) : (
          <TemplateSelect
            templates={options.templates}
            value={value.metaTemplateId}
            onSelect={selectTemplate}
          />
        )}

        {selected && value.paramMap.length > 0 && (
          <div className="space-y-2">
            <p className="text-warm-700 text-sm font-medium">Isi variabel</p>
            <div className="grid gap-2 md:grid-cols-2">
              {value.paramMap.map((param, i) => (
                <ParamSelect
                  key={i}
                  index={i}
                  value={param}
                  placeholders={placeholders}
                  onSelect={(p) => setParam(i, p)}
                />
              ))}
            </div>
          </div>
        )}

        {selected && (
          <TemplatePreview template={selected} params={{ body: previewBody }} />
        )}

        {error && <p className={cn('text-xs', TONES.danger.text)}>{error}</p>}
      </CardContent>
    </Card>
  )
}

function TemplateSelect({
  templates,
  value,
  onSelect,
}: {
  templates: WabaTemplateDto[]
  value: string | null
  onSelect: (id: string) => void
}) {
  if (templates.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Belum ada template Meta yang disetujui/menunggu review di nomor Cloud
        API yang terhubung. Siapkan lewat halaman Template WA (Starter Pack).
      </p>
    )
  }
  return (
    <Select value={value ?? NONE} onValueChange={onSelect}>
      <SelectTrigger>
        <SelectValue placeholder="Pilih template Meta" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Tidak pakai template Meta</SelectItem>
        {templates.map((t) => {
          const reason = metaLinkTemplateError(t)
          return (
            <SelectItem key={t.id} value={t.id} disabled={reason !== null}>
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  {t.name} ({t.language})
                  <StatusBadge
                    tone={STATUS_TONE[t.status]}
                    label={STATUS_LABEL[t.status]}
                  />
                </span>
                {reason && (
                  <span className="text-muted-foreground text-xs">
                    {reason}
                  </span>
                )}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

function ParamSelect({
  index,
  value,
  placeholders,
  onSelect,
}: {
  index: number
  value: string
  placeholders: readonly string[]
  onSelect: (placeholder: string) => void
}) {
  // Nilai lama yang bukan placeholder tunggal (mis. "Kak {nama}") tetap
  // ditampilkan sebagai opsi supaya tidak hilang diam-diam.
  const extra = value && !placeholders.includes(value) ? [value] : []
  return (
    <div className="space-y-2">
      <Label className="text-warm-700 text-sm font-medium">{`{{${index + 1}}}`}</Label>
      <Select
        value={value || UNSET}
        onValueChange={(v) => onSelect(v === UNSET ? '' : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Pilih isi" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET}>Belum dipilih</SelectItem>
          {[...extra, ...placeholders].map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
