'use client'

// Input parameter kirim template (reusable: Broadcast, Follow-up, Inbox,
// Test-send). Satu field per variabel header/body, sufiks URL dinamis, dan
// kode kupon. Opsi `placeholders` menambah tombol sisip (mis. {nama}).
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { extractPlaceholders } from '@/lib/services/waba/template-validate'
import { readTemplateButtons } from '@/lib/services/waba/template-payload'

import type { TemplateSendParamsDto, WabaTemplateDto } from './types'

export type ParamsTemplate = Pick<
  WabaTemplateDto,
  'category' | 'headerType' | 'headerText' | 'headerTextExample' | 'headerMediaUrl' | 'bodyText' | 'bodyExamples' | 'buttons'
>

interface Props {
  template: ParamsTemplate
  value: TemplateSendParamsDto
  onChange: (next: TemplateSendParamsDto) => void
  /** Placeholder hulao yang bisa disisipkan (label + nilai literal). */
  placeholders?: { label: string; value: string }[]
  disabled?: boolean
  /** Label khusus body (mis. untuk AUTH: "Kode OTP"). */
  compact?: boolean
}

function bodyCount(template: ParamsTemplate): number {
  if (template.category === 'AUTHENTICATION') return 1
  const nums = extractPlaceholders(template.bodyText)
  return nums.length ? Math.max(...nums) : 0
}

export function emptyParamsFor(template: ParamsTemplate): TemplateSendParamsDto {
  const n = bodyCount(template)
  const headerVar = template.headerType === 'TEXT' && extractPlaceholders(template.headerText).length > 0
  const buttons = readTemplateButtons(template.buttons)
  const btn: TemplateSendParamsDto['buttons'] = []
  buttons.forEach((b, index) => {
    if (b.type === 'URL' && extractPlaceholders(b.url).length > 0) btn.push({ index, subType: 'url', value: '' })
    if (b.type === 'COPY_CODE') btn.push({ index, subType: 'copy_code', value: '' })
  })
  return {
    ...(headerVar ? { header: { type: 'text', value: '' } } : {}),
    body: Array.from({ length: n }, () => ''),
    ...(btn.length ? { buttons: btn } : {}),
  }
}

/** Apakah semua parameter wajib sudah terisi. */
export function paramsComplete(template: ParamsTemplate, value: TemplateSendParamsDto): boolean {
  const n = bodyCount(template)
  for (let i = 0; i < n; i += 1) if (!value.body[i]?.trim()) return false
  if (template.headerType === 'TEXT' && extractPlaceholders(template.headerText).length > 0) {
    if (!value.header?.value?.trim()) return false
  }
  for (const b of value.buttons ?? []) if (!b.value?.trim()) return false
  return true
}

export function TemplateParamsFields({ template, value, onChange, placeholders, disabled, compact }: Props) {
  const n = bodyCount(template)
  const isAuth = template.category === 'AUTHENTICATION'
  const headerVar = template.headerType === 'TEXT' && extractPlaceholders(template.headerText).length > 0
  const buttons = readTemplateButtons(template.buttons)

  const setBody = (i: number, v: string) => {
    const body = [...value.body]
    while (body.length < n) body.push('')
    body[i] = v
    onChange({ ...value, body })
  }
  const setHeader = (v: string) => onChange({ ...value, header: { type: 'text', value: v } })
  const setButton = (index: number, subType: 'url' | 'copy_code', v: string) => {
    const rest = (value.buttons ?? []).filter((b) => b.index !== index)
    onChange({ ...value, buttons: [...rest, { index, subType, value: v }].sort((a, b) => a.index - b.index) })
  }

  const insertChips = (onInsert: (v: string) => void) =>
    placeholders && placeholders.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {placeholders.map((p) => (
          <Button
            key={p.value}
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            disabled={disabled}
            onClick={() => onInsert(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>
    ) : null

  if (n === 0 && !headerVar && buttons.every((b) => b.type !== 'COPY_CODE' && !(b.type === 'URL' && extractPlaceholders(b.url).length))) {
    return <p className="text-xs text-muted-foreground">Template ini tidak punya variabel — langsung bisa dikirim.</p>
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {headerVar && (
        <div className="space-y-1">
          <Label className="text-xs">Header {'{{1}}'}{template.headerTextExample ? ` · contoh: ${template.headerTextExample}` : ''}</Label>
          <Input value={value.header?.value ?? ''} onChange={(e) => setHeader(e.target.value)} disabled={disabled} />
          {insertChips((v) => setHeader(`${value.header?.value ?? ''}${v}`))}
        </div>
      )}
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="space-y-1">
          <Label className="text-xs">
            {isAuth ? 'Kode OTP' : `Variabel {{${i + 1}}}`}
            {!isAuth && template.bodyExamples[i] ? (
              <span className="ml-1 text-muted-foreground">· contoh: {template.bodyExamples[i]}</span>
            ) : null}
          </Label>
          <Input
            value={value.body[i] ?? ''}
            onChange={(e) => setBody(i, e.target.value)}
            placeholder={template.bodyExamples[i] ?? ''}
            disabled={disabled}
          />
          {insertChips((v) => setBody(i, `${value.body[i] ?? ''}${v}`))}
        </div>
      ))}
      {buttons.map((b, index) => {
        if (b.type === 'URL' && extractPlaceholders(b.url).length > 0) {
          const cur = value.buttons?.find((x) => x.index === index)?.value ?? ''
          return (
            <div key={`btn-${index}`} className="space-y-1">
              <Label className="text-xs">
                Sufiks URL tombol &ldquo;{b.text}&rdquo; · {b.url.replace(/\{\{\s*1\s*\}\}/, '…')}
              </Label>
              <Input value={cur} onChange={(e) => setButton(index, 'url', e.target.value)} placeholder={b.example ?? ''} disabled={disabled} />
              {insertChips((v) => setButton(index, 'url', `${cur}${v}`))}
            </div>
          )
        }
        if (b.type === 'COPY_CODE') {
          const cur = value.buttons?.find((x) => x.index === index)?.value ?? ''
          return (
            <div key={`btn-${index}`} className="space-y-1">
              <Label className="text-xs">Kode kupon (tombol salin) · contoh: {b.example}</Label>
              <Input value={cur} onChange={(e) => setButton(index, 'copy_code', e.target.value)} maxLength={15} disabled={disabled} />
            </div>
          )
        }
        return null
      })}
    </div>
  )
}
