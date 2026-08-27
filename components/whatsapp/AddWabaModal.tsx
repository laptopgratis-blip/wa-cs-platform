'use client'

// Modal "Hubungkan WhatsApp Business API (resmi Meta)" — pola kirimchat (palet
// hulao): dua tab.
//  • Embedded Signup (default) — jalur FB JS SDK, tanpa token manual. Cocok
//    untuk coexistence (nomor tetap dipakai di HP).
//  • Token Manual — user memasukkan Access Token + WABA ID sendiri (developer /
//    migrasi). Keduanya lewati popup "Perhatian" dulu sebelum jalan.
import { useState } from 'react'
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Monitor,
  ShieldCheck,
  Smartphone,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

import { useEmbeddedSignup, type ExchangeResult } from './useEmbeddedSignup'
import { WabaConnectResult } from './WabaConnectResult'
import { WabaWarningDialog } from './WabaWarningDialog'

interface AddWabaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected: () => void
}

type Mode = 'embedded' | 'manual'

export function AddWabaModal({
  open,
  onOpenChange,
  onConnected,
}: AddWabaModalProps) {
  const embedded = useEmbeddedSignup(open)
  const [mode, setMode] = useState<Mode>('embedded')
  const [pin, setPin] = useState('')

  // Jalur manual (state lokal — hook hanya menangani embedded).
  const [token, setToken] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [manualBusy, setManualBusy] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [manualResult, setManualResult] = useState<ExchangeResult | null>(null)

  // Popup "Perhatian" — gerbang sebelum aksi hubungkan dijalankan.
  const [warnOpen, setWarnOpen] = useState(false)

  const embeddedBusy =
    embedded.phase === 'preparing' ||
    embedded.phase === 'meta' ||
    embedded.phase === 'exchanging'
  const busy = embeddedBusy || manualBusy
  const activeResult = embedded.result ?? manualResult
  const activeError = embedded.result ? embedded.error : manualError

  const embeddedButtonText =
    embedded.phase === 'preparing'
      ? 'Menyiapkan…'
      : embedded.phase === 'meta'
        ? 'Menunggu proses di jendela Meta…'
        : embedded.phase === 'exchanging'
          ? 'Menghubungkan nomor…'
          : 'Hubungkan WhatsApp Business'

  function resetAll() {
    embedded.reset()
    setPin('')
    setToken('')
    setWabaId('')
    setManualError(null)
    setManualResult(null)
    setMode('embedded')
  }

  // Validasi PIN dipakai kedua jalur.
  function pinOk(): boolean {
    if (pin && !/^\d{6}$/.test(pin)) {
      toast.error('PIN harus 6 digit angka')
      return false
    }
    return true
  }

  function requestConnect() {
    if (!pinOk()) return
    if (mode === 'manual') {
      if (token.trim().length < 20) {
        toast.error('Access token tidak valid')
        return
      }
      if (!/^\d{5,20}$/.test(wabaId.trim())) {
        toast.error('WABA ID harus berupa angka')
        return
      }
    }
    setWarnOpen(true)
  }

  async function runConnect() {
    if (mode === 'embedded') {
      const r = await embedded.launch({ pin: pin || undefined })
      if (r.cancelled) toast.info('Proses dibatalkan di jendela Meta')
      return
    }
    // Manual token.
    setManualBusy(true)
    setManualError(null)
    try {
      const res = await fetch('/api/whatsapp/waba/connect-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: token.trim(),
          wabaId: wabaId.trim(),
          pin: pin || undefined,
        }),
      })
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: ExchangeResult; error?: string }
        | null
      if (!json?.success || !json.data) {
        setManualError(json?.error || 'Gagal menghubungkan nomor')
        return
      }
      setManualResult(json.data)
    } catch {
      setManualError('Tidak bisa terhubung ke server — cek koneksi internet lalu coba lagi.')
    } finally {
      setManualBusy(false)
    }
  }

  // retryRegister untuk hasil manual (endpoint sama dengan hook embedded).
  async function manualRetryRegister(newPin: string): Promise<boolean> {
    if (!manualResult) return false
    const res = await fetch('/api/whatsapp/waba/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: manualResult.sessionId, pin: newPin }),
    })
    const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null
    if (!json?.success) {
      setManualError(json?.error || 'Register ulang gagal')
      return false
    }
    setManualResult({ ...manualResult, warning: undefined, warningCode: undefined })
    return true
  }

  function handleDone() {
    onConnected()
    onOpenChange(false)
    resetAll()
  }

  function handleOpenChange(next: boolean) {
    if (!next && busy) return // jangan tutup di tengah proses
    if (!next) {
      if (activeResult) onConnected()
      resetAll()
    }
    onOpenChange(next)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className={cn('size-5', TONES.success.text)} />
              Hubungkan WhatsApp Business
            </DialogTitle>
            <DialogDescription>
              Jalur resmi Meta (Cloud API) — tanpa risiko banned. Pilih Embedded Signup, atau masukkan
              token sendiri lewat Token Manual.
            </DialogDescription>
          </DialogHeader>

          {activeResult ? (
            <WabaConnectResult
              result={activeResult}
              error={activeError}
              onRetryRegister={embedded.result ? embedded.retryRegister : manualRetryRegister}
              onDone={handleDone}
            />
          ) : (
            <div className="space-y-4">
              <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="embedded" disabled={busy}>
                    <Smartphone className="mr-1.5 size-4" /> Embedded Signup
                  </TabsTrigger>
                  <TabsTrigger value="manual" disabled={busy}>
                    <KeyRound className="mr-1.5 size-4" /> Token Manual
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {mode === 'embedded' ? (
                <div className="space-y-4">
                  <div
                    className={cn(
                      'rounded-xl border p-3 text-sm',
                      TONES.success.bg,
                      TONES.success.border,
                    )}
                  >
                    <p className={cn('flex items-center gap-2 font-medium', TONES.success.text)}>
                      <Smartphone className="size-4" /> Direkomendasikan: nomor tetap dipakai di HP
                    </p>
                    <ul className={cn('mt-1.5 space-y-1 text-xs', TONES.success.text)}>
                      <li>
                        • Di jendela Meta pilih{' '}
                        <b>&ldquo;Hubungkan Aplikasi WhatsApp Business&rdquo;</b> lalu scan QR dari HP.
                      </li>
                      <li>• Chat tetap masuk ke HP; CS bisa balas dari HP maupun dari hulao.</li>
                      <li>• Kontak &amp; riwayat chat (≤ 6 bulan) ikut disinkronkan.</li>
                      <li>
                        • Syarat: nomor terpasang di <b>WhatsApp Business App</b> versi terbaru.
                      </li>
                    </ul>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-warm-500">
                    <ShieldCheck className="size-3.5" /> Alternatif nomor baru/khusus: pilih
                    &ldquo;Tambahkan nomor&rdquo; di jendela Meta.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div
                    className={cn(
                      'rounded-xl border p-3 text-sm',
                      TONES.info.bg,
                      TONES.info.border,
                    )}
                  >
                    <p className={cn('flex items-center gap-2 font-medium', TONES.info.text)}>
                      <KeyRound className="size-4" /> Koneksi Token Manual
                    </p>
                    <p className={cn('mt-1 text-xs', TONES.info.text)}>
                      Hubungkan pakai Access Token &amp; WABA ID sendiri — cocok untuk developer atau
                      migrasi dari platform lain.
                    </p>
                    <a
                      href="https://developers.facebook.com/docs/whatsapp/business-management-api/get-started"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn('mt-1.5 inline-flex items-center gap-1 text-xs font-medium underline', TONES.info.text)}
                    >
                      Cara mendapatkan Access Token &amp; WABA ID <ExternalLink className="size-3" />
                    </a>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="waba-token">Access Token</Label>
                    <div className="relative">
                      <Input
                        id="waba-token"
                        type={showToken ? 'text' : 'password'}
                        placeholder="Masukkan access token WhatsApp Business API"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        disabled={busy}
                        className="pr-9 font-mono"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600"
                        aria-label={showToken ? 'Sembunyikan token' : 'Tampilkan token'}
                      >
                        {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-warm-500">
                      System User Token dari Meta Business Suite / Developer Console.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="waba-id">WABA ID</Label>
                    <Input
                      id="waba-id"
                      inputMode="numeric"
                      placeholder="contoh: 123456789012345"
                      value={wabaId}
                      onChange={(e) => setWabaId(e.target.value.replace(/\D/g, ''))}
                      disabled={busy}
                      className="font-mono"
                    />
                    <p className="text-xs text-warm-500">
                      ID WhatsApp Business Account dari Meta Developer Console.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="waba-pin" className="text-xs">
                  PIN verifikasi dua langkah{' '}
                  <span className="text-warm-500">(opsional — nomor lama yang sudah punya PIN)</span>
                </Label>
                <Input
                  id="waba-pin"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Kosongkan bila tidak punya — dibuatkan otomatis"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={busy}
                />
              </div>

              {activeError && !activeResult && (
                <div
                  className={cn(
                    'flex items-start gap-2 rounded-lg border p-2.5 text-xs',
                    TONES.danger.bg,
                    TONES.danger.border,
                    TONES.danger.text,
                  )}
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <div className="space-y-1">
                    <p>{activeError}</p>
                    {mode === 'embedded' && embedded.phase === 'error' && (
                      <button
                        type="button"
                        className="underline underline-offset-2"
                        onClick={() => void embedded.retryPrepare()}
                      >
                        Coba lagi
                      </button>
                    )}
                  </div>
                </div>
              )}

              <Button onClick={requestConnect} disabled={busy} className="w-full">
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {mode === 'embedded' ? embeddedButtonText : 'Hubungkan WhatsApp'}
              </Button>

              {mode === 'embedded' && (
                <p className="flex items-center gap-1.5 text-xs text-warm-500">
                  <Monitor className="size-3" /> Disarankan dari laptop/desktop; izinkan popup untuk
                  situs ini.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <WabaWarningDialog open={warnOpen} onOpenChange={setWarnOpen} onConfirm={() => void runConnect()} />
    </>
  )
}
