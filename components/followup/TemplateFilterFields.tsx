'use client'

// Field trigger + filter (cara bayar, jenis order, scope, status) untuk modal
// Template Follow-Up. Dipisah dari TemplateModal supaya file tetap kecil.
import type { ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  DELIVERY_STATUSES,
  NULL_VALUE,
  PAYMENT_STATUSES,
  TRIGGERS,
  type FormItem,
} from './followup-template-types'

export interface TemplateFilters {
  trigger: string
  delayDays: number
  paymentMethod: string
  orderType: string
  applyOnPayment: string
  applyOnDelivery: string
  scope: 'GLOBAL' | 'FORM'
  orderFormId: string
}

interface Props {
  value: TemplateFilters
  forms: FormItem[]
  onChange: (next: TemplateFilters) => void
}

function Field({
  label,
  value,
  onChange,
  children,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
  placeholder?: string
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  )
}

export function TemplateFilterFields({ value, forms, onChange }: Props) {
  const set = <K extends keyof TemplateFilters>(
    key: K,
    v: TemplateFilters[K],
  ) => onChange({ ...value, [key]: v })
  const isDaysAfter = value.trigger.startsWith('DAYS_AFTER')

  return (
    <>
      <Field
        label="Trigger"
        value={value.trigger}
        onChange={(v) => set('trigger', v)}
      >
        {TRIGGERS.map((t) => (
          <SelectItem key={t.value} value={t.value}>
            {t.label}
          </SelectItem>
        ))}
      </Field>

      {isDaysAfter && (
        <div className="space-y-2">
          <Label>Berapa Hari Setelah Event (max 30)</Label>
          <Input
            type="number"
            min={0}
            max={30}
            value={value.delayDays}
            onChange={(e) =>
              set(
                'delayDays',
                Math.max(0, Math.min(30, Number(e.target.value))),
              )
            }
          />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Untuk Cara Bayar"
          value={value.paymentMethod}
          onChange={(v) => set('paymentMethod', v)}
        >
          <SelectItem value={NULL_VALUE}>Semua</SelectItem>
          <SelectItem value="COD">COD only</SelectItem>
          <SelectItem value="TRANSFER">Transfer only</SelectItem>
          <SelectItem value="TRIPAY">Bayar Otomatis (VA/QRIS) only</SelectItem>
        </Field>
        <Field
          label="Untuk Jenis Order"
          value={value.orderType}
          onChange={(v) => set('orderType', v)}
        >
          <SelectItem value={NULL_VALUE}>Semua</SelectItem>
          <SelectItem value="PHYSICAL">Fisik saja (ada pengiriman)</SelectItem>
          <SelectItem value="DIGITAL">
            Digital saja (e-book, tanpa kirim)
          </SelectItem>
        </Field>
        <Field
          label="Berlaku Untuk"
          value={value.scope}
          onChange={(v) => set('scope', v as 'GLOBAL' | 'FORM')}
        >
          <SelectItem value="GLOBAL">Semua form</SelectItem>
          <SelectItem value="FORM">Form tertentu</SelectItem>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Filter Payment Status (opsional)"
          value={value.applyOnPayment}
          onChange={(v) => set('applyOnPayment', v)}
        >
          <SelectItem value={NULL_VALUE}>Tidak filter</SelectItem>
          {PAYMENT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </Field>
        <Field
          label="Filter Delivery Status (opsional)"
          value={value.applyOnDelivery}
          onChange={(v) => set('applyOnDelivery', v)}
        >
          <SelectItem value={NULL_VALUE}>Tidak filter</SelectItem>
          {DELIVERY_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </Field>
      </div>

      {value.scope === 'FORM' && (
        <Field
          label="Pilih Form"
          value={value.orderFormId}
          onChange={(v) => set('orderFormId', v)}
          placeholder="Pilih form"
        >
          {forms.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </Field>
      )}
    </>
  )
}
