'use client'

// Modal "Hubungkan WhatsApp Business API (resmi)" — membuka popup Embedded
// Signup Meta. Hasil dikirim balik oleh halaman /whatsapp/waba-callback via
// postMessage (origin yang sama), lalu daftar sesi di-refresh.

import { useCallback, useEffect, useRef, useState } from 'react'
import { BadgeCheck, Loader2, ShieldCheck, Zap } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface AddWabaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected: () => void
}

type WabaPostMessage =
  | { type: 'waba:connected'; sessionId?: string }
  | { type: 'waba:error'; error?: string }

export function AddWabaModal({ open, onOpenChange, onConnected }: AddWabaModalProps) {
  const [isStarting, setStarting] = useState(false)
  const [isWaiting, setWaiting] = useState(false)
  const popupRef = useRef<Window | null>(null)

  // Terima hasil dari halaman callback di popup.
  useEffect(() => {
    if (!open) return

    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data = event.data as WabaPostMessage
      if (data?.type === 'waba:connected') {
        toast.success('Nomor WhatsApp Business API berhasil terhubung!')
        setWaiting(false)
        onConnected()
        onOpenChange(false)
      } else if (data?.type === 'waba:error') {
        toast.error(data.error || 'Gagal menghubungkan nomor')
        setWaiting(false)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [open, onConnected, onOpenChange])

  const startSignup = useCallback(async () => {
    setStarting(true)
    // Buka popup SINKRON dalam gesture klik (anti popup-blocker), isi URL
    // setelah didapat dari server.
    const popup = window.open(
      '',
      'waba-signup',
      'width=680,height=760,menubar=no,toolbar=no',
    )
    popupRef.current = popup

    try {
      const res = await fetch('/api/whatsapp/waba/signup', { method: 'POST' })
      const json = (await res.json().catch(() => null)) as {
        success?: boolean
        data?: { url?: string }
        error?: string
      } | null

      if (!json?.success || !json.data?.url) {
        popup?.close()
        toast.error(json?.error || 'Gagal memulai proses hubungkan')
        return
      }

      if (popup && !popup.closed) {
        popup.location.href = json.data.url
        setWaiting(true)
      } else {
        // Popup diblokir browser — fallback: buka di tab yang sama.
        toast.info('Popup diblokir — membuka halaman Meta di tab ini')
        window.location.href = json.data.url
      }
    } catch {
      popup?.close()
      toast.error('Tidak bisa menghubungi server')
    } finally {
      setStarting(false)
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hubungkan WhatsApp Business API</DialogTitle>
          <DialogDescription>
            Jalur resmi Meta (Cloud API) — tanpa scan QR, tanpa risiko banned.
            Kamu akan login Facebook lalu memilih/membuat WhatsApp Business
            Account di jendela popup.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary-500" />
            Nomor terdaftar resmi di Meta atas nama bisnismu
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary-500" />
            Stabil — tidak bergantung koneksi HP dan tidak kena putus sesi
          </li>
          <li className="flex items-start gap-2">
            <Zap className="mt-0.5 size-4 shrink-0 text-primary-500" />
            Balasan AI dalam 24 jam sejak chat customer: gratis biaya Meta
          </li>
        </ul>

        <Button
          onClick={startSignup}
          disabled={isStarting || isWaiting}
          className="w-full bg-primary-500 text-white hover:bg-primary-600"
        >
          {isStarting || isWaiting ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : null}
          {isWaiting ? 'Menunggu proses di jendela Meta...' : 'Lanjutkan dengan Meta'}
        </Button>

        <p className="text-xs text-muted-foreground">
          Butuh: akun Facebook yang mengelola bisnis + nomor yang tidak sedang
          dipakai aplikasi WhatsApp biasa.
        </p>
      </DialogContent>
    </Dialog>
  )
}
