'use client'

// Modal flow tambah WhatsApp:
// 1. Open → POST /api/whatsapp/connect → terima sessionId baru.
// 2. Subscribe Socket.io ke `session:<sessionId>`.
// 3. Render QR (dari event 'qr') sampai user scan.
// 4. Saat status CONNECTED → close modal + trigger refresh list.
// 5. Kalau user batal → POST disconnect (wipe) supaya tidak dangling.
import { Loader2, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getSocket,
  type QrEventPayload,
  type StatusEventPayload,
  type WaStatus,
} from '@/lib/socket-client'

interface AddWaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected: () => void
  /** Kalau diisi: re-pair session existing (panggil /reconnect). Kalau null:
   *  bikin session baru via /connect. */
  existingSessionId?: string | null
}

interface ConnectResponse {
  success: boolean
  data?: { id: string; status: WaStatus }
  error?: string
}

export function AddWaModal({
  open,
  onOpenChange,
  onConnected,
  existingSessionId,
}: AddWaModalProps) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<WaStatus>('CONNECTING')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCancelling, setCancelling] = useState(false)
  const sessionRef = useRef<string | null>(null)
  const isRepair = Boolean(existingSessionId)

  // Buat session baru (atau pair-ulang existing) saat modal dibuka.
  useEffect(() => {
    if (!open) return
    setStatus('CONNECTING')
    setQrDataUrl(null)
    setError(null)
    let aborted = false

    ;(async () => {
      try {
        const url = existingSessionId
          ? `/api/whatsapp/${existingSessionId}/reconnect`
          : '/api/whatsapp/connect'
        const res = await fetch(url, { method: 'POST' })
        const json = (await res.json()) as ConnectResponse
        if (aborted) return
        if (!res.ok || !json.success || !json.data) {
          setError(json.error || 'Gagal memulai koneksi')
          return
        }
        setSessionId(json.data.id)
        sessionRef.current = json.data.id
        setStatus(json.data.status)
      } catch (err) {
        if (aborted) return
        setError((err as Error).message)
      }
    })()

    return () => {
      aborted = true
    }
  }, [open, existingSessionId])

  // Subscribe Socket.io ke session room dan dengarkan event.
  useEffect(() => {
    if (!open || !sessionId) return
    const socket = getSocket()
    socket.emit('subscribe', sessionId)

    function handleQr(payload: QrEventPayload) {
      if (payload.sessionId !== sessionId) return
      setQrDataUrl(payload.qrDataUrl)
      setStatus('WAITING_QR')
    }
    function handleStatus(payload: StatusEventPayload) {
      if (payload.sessionId !== sessionId) return
      // Defensive: hanya update kalau payload punya status (event 'connected'/
      // 'disconnected' punya schema beda — tidak ada field status).
      if (payload.status) setStatus(payload.status)
      if (payload.reason) setError(payload.reason)
    }
    function handleConnected(payload: StatusEventPayload) {
      if (payload.sessionId !== sessionId) return
      // Sinkron ke DB lewat endpoint status, lalu tutup modal.
      void fetch(`/api/whatsapp/${sessionId}/status`).then(() => {
        toast.success('WhatsApp terhubung')
        onConnected()
        onOpenChange(false)
      })
    }

    socket.on('qr', handleQr)
    socket.on('status', handleStatus)
    socket.on('connected', handleConnected)

    return () => {
      socket.off('qr', handleQr)
      socket.off('status', handleStatus)
      socket.off('connected', handleConnected)
      socket.emit('unsubscribe', sessionId)
    }
  }, [open, sessionId, onConnected, onOpenChange])

  // Kalau status berubah ke CONNECTED via event 'status' (tanpa 'connected' fire),
  // pastikan kita tetap close + refresh.
  useEffect(() => {
    if (status === 'CONNECTED' && sessionId) {
      void fetch(`/api/whatsapp/${sessionId}/status`).then(() => {
        toast.success('WhatsApp terhubung')
        onConnected()
        onOpenChange(false)
      })
    }
  }, [status, sessionId, onConnected, onOpenChange])

  const cancelAndClose = useCallback(async () => {
    const id = sessionRef.current
    if (!id) {
      onOpenChange(false)
      return
    }
    // Mode re-pair: jangan wipe row DB, cukup tutup modal. User mungkin ingin
    // coba lagi nanti. Mode tambah-baru: wipe supaya tidak ada session zombie.
    if (isRepair) {
      sessionRef.current = null
      setSessionId(null)
      onOpenChange(false)
      return
    }
    setCancelling(true)
    try {
      await fetch(`/api/whatsapp/${id}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wipe: true }),
      })
    } catch {
      // Diabaikan — yang penting modal tertutup.
    } finally {
      setCancelling(false)
      sessionRef.current = null
      setSessionId(null)
      onOpenChange(false)
    }
  }, [isRepair, onOpenChange])

  // Reset state saat modal benar-benar tertutup.
  useEffect(() => {
    if (!open) {
      sessionRef.current = null
      setSessionId(null)
      setQrDataUrl(null)
      setError(null)
    }
  }, [open])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && status !== 'CONNECTED') {
          // User klik X / klik luar → batalkan session.
          void cancelAndClose()
          return
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isRepair ? 'Pair Ulang WhatsApp' : 'Tambah WhatsApp'}
          </DialogTitle>
          <DialogDescription>
            {isRepair && (
              <>
                Pastikan dulu device <strong>Hulao</strong> lama sudah di-unlink
                di HP (Pengaturan → Perangkat Tertaut), lalu scan QR baru di bawah.
                <br />
              </>
            )}
            Buka WhatsApp di HP → <strong>Pengaturan</strong> →{' '}
            <strong>Perangkat Tertaut</strong> → <strong>Tautkan Perangkat</strong>,
            lalu pindai QR di bawah.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-[320px] items-center justify-center rounded-lg border bg-muted/30 p-4">
          {error ? (
            <div className="text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => onOpenChange(false)}
              >
                <X className="mr-2 size-4" /> Tutup
              </Button>
            </div>
          ) : qrDataUrl ? (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="QR Code WhatsApp"
                width={280}
                height={280}
                className="rounded bg-white p-2"
              />
              <p className="text-xs text-muted-foreground">
                QR otomatis refresh kalau kadaluarsa
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
              <Loader2 className="size-8 animate-spin" />
              <span>
                {status === 'CONNECTING'
                  ? 'Menghubungkan ke WhatsApp...'
                  : 'Menyiapkan QR...'}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="size-3" />
            Status: <span className="font-medium text-foreground">{status}</span>
          </p>
          <Button
            variant="ghost"
            onClick={cancelAndClose}
            disabled={isCancelling}
          >
            {isCancelling && <Loader2 className="mr-2 size-4 animate-spin" />}
            Batal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
