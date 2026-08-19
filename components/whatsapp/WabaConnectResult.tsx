'use client'

// Hasil akhir Embedded Signup — ditampilkan di AddWabaModal setelah exchange.
// Termasuk PIN yang dibuat hulao (ditampilkan SEKALI), catatan sync
// coexistence, dan jalur pulih untuk register gagal karena PIN.

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, Loader2, RefreshCw, Smartphone } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { ExchangeResult } from './useEmbeddedSignup'

interface WabaConnectResultProps {
  result: ExchangeResult
  error: string | null
  onRetryRegister: (pin: string) => Promise<boolean>
  onDone: () => void
}

export function WabaConnectResult({ result, error, onRetryRegister, onDone }: WabaConnectResultProps) {
  const [pin, setPin] = useState('')
  const [isRetrying, setRetrying] = useState(false)
  const pinRetryable =
    result.warningCode === 'PIN_MISMATCH' || result.warningCode === 'PIN_RATE_LIMIT'

  async function copyPin() {
    if (!result.generatedPin) return
    try {
      await navigator.clipboard.writeText(result.generatedPin)
      toast.success('PIN disalin')
    } catch {
      toast.error('Gagal menyalin — catat manual')
    }
  }

  async function retry() {
    if (!/^\d{6}$/.test(pin)) {
      toast.error('PIN harus 6 digit angka')
      return
    }
    setRetrying(true)
    try {
      const ok = await onRetryRegister(pin)
      if (ok) toast.success('Nomor berhasil didaftarkan')
    } finally {
      setRetrying(false)
    }
  }

  const label = result.displayName || (result.phoneNumber ? `+${result.phoneNumber}` : 'Nomor WhatsApp')

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-warm-200 bg-warm-50 p-3">
        {result.warning ? (
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        )}
        <div className="min-w-0">
          <p className="font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            {result.phoneNumber && result.displayName ? `+${result.phoneNumber} · ` : ''}
            {result.mode === 'COEXISTENCE' ? (
              <span className="inline-flex items-center gap-1">
                <Smartphone className="size-3" /> Coexistence — nomor tetap aktif di HP
              </span>
            ) : (
              'Nomor khusus Cloud API'
            )}
          </p>
        </div>
      </div>

      {result.generatedPin && (
        <Alert>
          <AlertTitle>Simpan PIN verifikasi dua langkah nomor ini</AlertTitle>
          <AlertDescription>
            <div className="mt-1 flex items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 font-mono text-lg tracking-widest">
                {result.generatedPin}
              </code>
              <Button type="button" size="sm" variant="outline" onClick={copyPin}>
                <Copy className="mr-1 size-3.5" /> Salin
              </Button>
            </div>
            <p className="mt-2 text-xs">
              PIN ini dibuat otomatis dan <b>hanya ditampilkan sekali</b>. Diperlukan bila
              nomor ini nanti dipindahkan atau dihubungkan ulang.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {result.warning && (
        <Alert variant="destructive">
          <AlertTitle>Terhubung dengan catatan</AlertTitle>
          <AlertDescription>{result.warning}</AlertDescription>
        </Alert>
      )}

      {pinRetryable && (
        <div className="space-y-2 rounded-xl border p-3">
          <Label htmlFor="waba-retry-pin" className="text-xs">
            Masukkan PIN two-step nomor ini
          </Label>
          <div className="flex gap-2">
            <Input
              id="waba-retry-pin"
              inputMode="numeric"
              maxLength={6}
              placeholder="6 digit"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <Button type="button" onClick={retry} disabled={isRetrying}>
              {isRetrying ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 size-4" />
              )}
              Daftar ulang
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}

      {result.syncScheduled && (
        <p className="text-xs text-muted-foreground">
          Sinkronisasi kontak & riwayat chat (≤ 6 bulan) dari HP dimulai di latar belakang —
          progresnya bisa dilihat di kartu nomor.
        </p>
      )}

      <Button onClick={onDone} className="w-full bg-primary-500 text-white hover:bg-primary-600">
        Selesai
      </Button>
    </div>
  )
}
