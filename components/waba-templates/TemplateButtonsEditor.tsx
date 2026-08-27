'use client'

// Editor tombol template (non-AUTH): Quick Reply, URL (statis/dinamis),
// Telepon, Salin kode. Batas Meta: total ≤10, URL ≤2, telepon ≤1, kupon ≤1.
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { WabaTemplateButton, WabaTemplateButtonType } from '@/lib/services/waba/types'

interface Props {
  value: WabaTemplateButton[]
  onChange: (next: WabaTemplateButton[]) => void
  disabled?: boolean
}

const TYPE_LABEL: Record<Exclude<WabaTemplateButtonType, 'OTP'>, string> = {
  QUICK_REPLY: 'Balas cepat',
  URL: 'Buka tautan (URL)',
  PHONE_NUMBER: 'Telepon',
  COPY_CODE: 'Salin kode kupon',
}

function defaultButton(type: Exclude<WabaTemplateButtonType, 'OTP'>): WabaTemplateButton {
  switch (type) {
    case 'QUICK_REPLY':
      return { type: 'QUICK_REPLY', text: '' }
    case 'URL':
      return { type: 'URL', text: '', url: 'https://' }
    case 'PHONE_NUMBER':
      return { type: 'PHONE_NUMBER', text: '', phone_number: '+62' }
    case 'COPY_CODE':
      return { type: 'COPY_CODE', example: '' }
  }
}

export function TemplateButtonsEditor({ value, onChange, disabled }: Props) {
  const counts = value.reduce<Record<string, number>>((acc, b) => {
    acc[b.type] = (acc[b.type] ?? 0) + 1
    return acc
  }, {})
  const canAdd = value.length < 10

  const update = (i: number, next: WabaTemplateButton) => onChange(value.map((b, idx) => (idx === i ? next : b)))
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))
  const add = (type: Exclude<WabaTemplateButtonType, 'OTP'>) => onChange([...value, defaultButton(type)])

  return (
    <div className="space-y-2">
      {value.map((b, i) => (
        <div key={i} className="rounded-lg border p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Select
              value={b.type}
              disabled={disabled}
              onValueChange={(t) => update(i, defaultButton(t as Exclude<WabaTemplateButtonType, 'OTP'>))}
            >
              <SelectTrigger size="sm" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABEL) as Array<keyof typeof TYPE_LABEL>).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="icon" variant="ghost" onClick={() => remove(i)} disabled={disabled} aria-label="Hapus tombol">
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>

          {b.type === 'QUICK_REPLY' && (
            <Input
              placeholder="Teks tombol (≤25)"
              maxLength={25}
              value={b.text}
              disabled={disabled}
              onChange={(e) => update(i, { ...b, text: e.target.value })}
            />
          )}
          {b.type === 'URL' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Teks tombol (≤25)"
                maxLength={25}
                value={b.text}
                disabled={disabled}
                onChange={(e) => update(i, { ...b, text: e.target.value })}
              />
              <Input
                placeholder="https://… (boleh diakhiri {{1}})"
                value={b.url}
                disabled={disabled}
                onChange={(e) => update(i, { ...b, url: e.target.value })}
              />
              {/\{\{\s*1\s*\}\}/.test(b.url) && (
                <div className="sm:col-span-2">
                  <Label className="text-xs">Contoh nilai sufiks {'{{1}}'} (untuk reviewer Meta)</Label>
                  <Input
                    placeholder="mis. INV-20260820-001"
                    value={b.example ?? ''}
                    disabled={disabled}
                    onChange={(e) => update(i, { ...b, example: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}
          {b.type === 'PHONE_NUMBER' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Teks tombol (≤25)"
                maxLength={25}
                value={b.text}
                disabled={disabled}
                onChange={(e) => update(i, { ...b, text: e.target.value })}
              />
              <Input
                placeholder="+6281234567890"
                value={b.phone_number}
                disabled={disabled}
                onChange={(e) => update(i, { ...b, phone_number: e.target.value })}
              />
            </div>
          )}
          {b.type === 'COPY_CODE' && (
            <Input
              placeholder="Contoh kode kupon (≤15), mis. HEMAT20"
              maxLength={15}
              value={b.example}
              disabled={disabled}
              onChange={(e) => update(i, { ...b, example: e.target.value })}
            />
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(TYPE_LABEL) as Array<keyof typeof TYPE_LABEL>).map((t) => {
          const limit = t === 'URL' ? 2 : t === 'PHONE_NUMBER' ? 1 : t === 'COPY_CODE' ? 1 : 10
          const full = (counts[t] ?? 0) >= limit
          return (
            <Button
              key={t}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={disabled || !canAdd || full}
              onClick={() => add(t)}
            >
              <Plus className="mr-1 size-3" /> {TYPE_LABEL[t]}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
