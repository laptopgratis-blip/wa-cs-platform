'use client'

// Modal "Hubungkan WhatsApp Business API (resmi Meta)" — jalur FB JS SDK.
// Default & yang dijelaskan: COEXISTENCE (nomor tetap dipakai di HP, CS bisa
// balas dari HP, hulao membaca & membalas via Cloud API). Alternatif nomor
// baru/khusus dipilih langsung di wizard Meta. Alur state di useEmbeddedSignup.

import { useState } from 'react'
import {
  AlertTriangle,
  Loader2,
  Monitor,
  Smartphone,
  ShieldCheck,
} from 'lucide-react'
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
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

import { useEmbeddedSignup } from './useEmbeddedSignup'
import { WabaConnectResult } from './WabaConnectResult'

interface AddWabaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected: () => void
}

export function AddWabaModal({
  open,
  onOpenChange,
  onConnected,
}: AddWabaModalProps) {
  const { phase, error, result, launch, retryRegister, reset, retryPrepare } =
    useEmbeddedSignup(open)
  const [pin, setPin] = useState('')

  const busy =
    phase === 'preparing' || phase === 'meta' || phase === 'exchanging'
  const buttonText =
    phase === 'preparing'
      ? 'Menyiapkan…'
      : phase === 'meta'
        ? 'Menunggu proses di jendela Meta…'
        : phase === 'exchanging'
          ? 'Menghubungkan nomor…'
          : 'Lanjutkan dengan Meta'

  async function handleLaunch() {
    if (pin && !/^\d{6}$/.test(pin)) {
      toast.error('PIN harus 6 digit angka')
      return
    }
    const r = await launch({ pin: pin || undefined })
    if (r.cancelled) toast.info('Proses dibatalkan di jendela Meta')
  }

  function handleDone() {
    onConnected()
    onOpenChange(false)
    reset()
    setPin('')
  }

  function handleOpenChange(next: boolean) {
    // Jangan tutup di tengah proses — hasil bisa hilang (mis. PIN yang baru dibuat).
    if (!next && busy) return
    if (!next) {
      if (result) onConnected()
      reset()
      setPin('')
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hubungkan WhatsApp Business API</DialogTitle>
          <DialogDescription>
            Jalur resmi Meta (Cloud API) — tanpa scan QR, tanpa risiko banned.
            Kamu akan login Facebook lalu memilih cara menghubungkan nomor di
            jendela Meta.
          </DialogDescription>
        </DialogHeader>

        {phase === 'success' && result ? (
          <WabaConnectResult
            result={result}
            error={error}
            onRetryRegister={retryRegister}
            onDone={handleDone}
          />
        ) : (
          <div className="space-y-4">
            <div
              className={cn(
                'rounded-xl border p-3 text-sm',
                TONES.success.bg,
                TONES.success.border,
              )}
            >
              <p
                className={cn(
                  'flex items-center gap-2 font-medium',
                  TONES.success.text,
                )}
              >
                <Smartphone className="size-4" /> Direkomendasikan: nomor tetap
                dipakai di HP
              </p>
              <ul
                className={cn('mt-1.5 space-y-1 text-xs', TONES.success.text)}
              >
                <li>
                  • Di jendela Meta pilih{' '}
                  <b>&ldquo;Hubungkan Aplikasi WhatsApp Business&rdquo;</b> lalu
                  scan QR dari HP.
                </li>
                <li>
                  • Chat tetap masuk ke HP; CS bisa balas dari HP maupun dari
                  hulao — semuanya tercatat di inbox.
                </li>
                <li>
                  • Kontak & riwayat chat (≤ 6 bulan) ikut disinkronkan ke
                  hulao.
                </li>
                <li>
                  • Syarat: nomor terpasang di <b>WhatsApp Business App</b>{' '}
                  (bukan WhatsApp biasa) versi terbaru.
                </li>
              </ul>
            </div>

            <div className="text-muted-foreground text-xs">
              <p className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" /> Alternatif: nomor
                baru/khusus (tidak terpasang di aplikasi WA mana pun) — pilih
                &ldquo;Tambahkan nomor&rdquo; di jendela Meta.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="waba-pin" className="text-xs">
                PIN verifikasi dua langkah{' '}
                <span className="text-muted-foreground">
                  (opsional — hanya nomor baru/khusus yang sudah punya PIN)
                </span>
              </Label>
              <Input
                id="waba-pin"
                inputMode="numeric"
                maxLength={6}
                placeholder="Kosongkan bila tidak punya — akan dibuatkan otomatis"
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                disabled={busy}
              />
            </div>

            {error && (
              <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-lg border p-2.5 text-xs">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <div className="space-y-1">
                  <p>{error}</p>
                  {phase === 'error' && (
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => void retryPrepare()}
                    >
                      Coba lagi
                    </button>
                  )}
                </div>
              </div>
            )}

            <Button onClick={handleLaunch} disabled={busy} className="w-full">
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {buttonText}
            </Button>

            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Monitor className="size-3" /> Disarankan dari laptop/desktop;
              izinkan popup untuk situs ini.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
