'use client'

// InlineBankAdd — form simple untuk tambah rekening pertama langsung di
// dalam wizard. POST /api/bank-accounts. Auto-set isDefault=true (rekening
// pertama biasanya jadi default tujuan transfer).
//
// Validasi mirror dari `bankAccountCreateSchema` di lib/validations.

import { CheckCircle2, Loader2, Save } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

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

import type { InlineTaskCommonProps } from './InlineTaskHost'

// Sinkron dengan BANK_OPTIONS di lib/validations/bank-account.ts.
const BANKS = [
  'BCA',
  'Mandiri',
  'BRI',
  'BNI',
  'Permata',
  'CIMB Niaga',
  'BTN',
  'Bank Jago',
  'Bank Mega',
  'BSI',
  'Danamon',
  'OCBC NISP',
  'SeaBank',
  'Lainnya',
]

export function InlineBankAdd({ onCompleted, fallbackHref }: InlineTaskCommonProps) {
  const [bankName, setBankName] = useState('BCA')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (accountNumber.trim().length < 5) {
      toast.error('Nomor rekening minimal 5 digit')
      return
    }
    if (accountName.trim().length < 1) {
      toast.error('Nama pemilik wajib diisi')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName,
          accountNumber: accountNumber.trim(),
          accountName: accountName.trim(),
          isDefault: true,
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal simpan rekening')
        setSubmitting(false)
        return
      }
      toast.success('Rekening tersimpan')
      setDone(true)
      setTimeout(() => onCompleted(), 800)
    } catch (err) {
      console.error('[InlineBankAdd]', err)
      toast.error('Tidak bisa hubungi server')
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="size-6" />
        </div>
        <p className="font-display text-base font-bold text-emerald-900">
          Rekening tersimpan
        </p>
        <p className="text-xs text-emerald-700">Lanjut ke step berikutnya…</p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border-2 border-primary-200 bg-card p-5"
    >
      <div className="space-y-1.5">
        <Label htmlFor="ob-bank-name" className="text-xs">
          Bank
        </Label>
        <Select value={bankName} onValueChange={setBankName}>
          <SelectTrigger id="ob-bank-name" className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BANKS.map((b) => (
              <SelectItem key={b} value={b} className="text-sm">
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ob-bank-number" className="text-xs">
          Nomor rekening
        </Label>
        <Input
          id="ob-bank-number"
          inputMode="numeric"
          value={accountNumber}
          onChange={(e) =>
            setAccountNumber(e.target.value.replace(/[^\d-]/g, ''))
          }
          maxLength={30}
          placeholder="1234567890"
          className="h-9 font-mono text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ob-bank-acc-name" className="text-xs">
          Nama pemilik (sesuai buku tabungan)
        </Label>
        <Input
          id="ob-bank-acc-name"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          maxLength={100}
          placeholder="John Doe"
          className="h-9 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="submit"
          disabled={submitting}
          className="bg-primary-500 hover:bg-primary-600"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Menyimpan…
            </>
          ) : (
            <>
              <Save className="mr-2 size-4" />
              Simpan rekening
            </>
          )}
        </Button>
      </div>

      <p className="text-[10px] text-warm-500">
        Bisa tambah rekening lain & set default lain dari halaman Pengaturan
        setelah onboarding selesai.
      </p>
    </form>
  )
}
