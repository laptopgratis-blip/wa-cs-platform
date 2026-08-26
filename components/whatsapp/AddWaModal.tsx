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
  subscribeWaSession,
  type QrEventPayload,
  type StatusEventPayload,
  type SubscribeErrorPayload,
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

// Label ramah untuk baris "Status" — jangan tampilkan raw enum ke user.
const STATUS_LABEL: Record<WaStatus, string> = {
  CONNECTING: 'Menghubungkan…',
  WAITING_QR: 'Menunggu dipindai',
  CONNECTED: 'Terhubung',
  DISCONNECTED: 'Terputus',
  PAUSED: 'Dijeda',
  ERROR: 'Gagal',
}

// QR WhatsApp berlaku ~60 detik. Baileys mengirim event 'qr' baru (biasanya
// setelah timeout + reconnect) yang me-reset countdown. Kalau habis sebelum QR
// baru datang, user diberi tombol "Muat ulang QR" (bukan spinner nyangkut).
const QR_TTL_SEC = 60

export function AddWaModal({
  open,
  onOpenChange,
  onConnected,
  existingSessionId,
}: AddWaModalProps) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<WaStatus>('CONNECTING')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrAt, setQrAt] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [isCancelling, setCancelling] = useState(false)
  const [isRefreshing, setRefreshing] = useState(false)
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
        // Guard parse: respons non-JSON (mis. halaman 502 proxy) jangan
        // dilempar sebagai SyntaxError mentah ke user.
        const json = (await res.json().catch(() => null)) as ConnectResponse | null
        if (aborted) return
        if (!res.ok || !json?.success || !json.data) {
          setError(json?.error || 'Gagal memulai koneksi')
          return
        }
        setSessionId(json.data.id)
        sessionRef.current = json.data.id
        setStatus(json.data.status)
      } catch {
        if (aborted) return
        // Error di sini = fetch gagal total; pesan bawaan browser ("Failed
        // to fetch") tidak membantu user.
        setError('Tidak bisa terhubung ke server — cek koneksi internet lalu coba lagi.')
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
    let cancelled = false

    // Subscribe pakai token short-lived dari server — wa-service menolak
    // join room tanpa token valid (anti QR hijack). isCancelled mencegah
    // subscribe telat (setelah cleanup unsubscribe) saat modal keburu ditutup.
    void subscribeWaSession(socket, sessionId, {
      isCancelled: () => cancelled,
    }).then((result) => {
      if (cancelled || result.ok) return
      setError(result.error || 'Gagal terhubung ke status realtime')
    })

    function handleQr(payload: QrEventPayload) {
      if (payload.sessionId !== sessionId) return
      setQrDataUrl(payload.qrDataUrl)
      const now = Date.now()
      setQrAt(now) // reset countdown tiap QR baru
      // Ticker 1 dtk baru menulis nowTick SATU detik kemudian. Tanpa seed ini
      // render pertama memakai nowTick=0 → (0 - qrAt) negatif raksasa dan
      // countdown sempat menampilkan angka ngaco (~1,7 miliar detik).
      setNowTick(now)
      setStatus('WAITING_QR')
      setError(null) // QR baru datang = pulih; buang error lama
    }
    function handleStatus(payload: StatusEventPayload) {
      if (payload.sessionId !== sessionId) return
      // Defensive: hanya update kalau payload punya status (event 'connected'/
      // 'disconnected' punya schema beda — tidak ada field status).
      if (payload.status) setStatus(payload.status)
      // `reason` cuma layak tampil merah kalau sesi benar-benar berhenti.
      // Saat CONNECTING/WAITING_QR/CONNECTED itu keterangan transien (mis.
      // pesan internal Baileys pasca-pairing) — menampilkannya bikin user
      // kira scan-nya gagal padahal koneksi sedang lanjut. Status non-terminal
      // juga membersihkan error lama supaya tidak nyangkut.
      if (payload.status === 'ERROR' || payload.status === 'DISCONNECTED') {
        if (payload.reason) setError(payload.reason)
      } else if (payload.status) {
        setError(null)
      }
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

    function handleSubscribeError(payload: SubscribeErrorPayload) {
      if (payload.sessionId !== sessionId) return
      setError(payload.error || 'Gagal subscribe status realtime')
    }

    socket.on('qr', handleQr)
    socket.on('status', handleStatus)
    socket.on('connected', handleConnected)
    socket.on('subscribe-error', handleSubscribeError)

    return () => {
      cancelled = true
      socket.off('qr', handleQr)
      socket.off('status', handleStatus)
      socket.off('connected', handleConnected)
      socket.off('subscribe-error', handleSubscribeError)
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

  // Minta QR baru (Baileys wipe + reconnect di sesi yang sama). Dipakai saat
  // countdown habis tapi QR baru belum datang.
  const refreshQr = useCallback(async () => {
    const id = sessionRef.current
    if (!id || isRefreshing) return
    setRefreshing(true)
    setQrDataUrl(null)
    setQrAt(null)
    setStatus('CONNECTING')
    try {
      const res = await fetch(`/api/whatsapp/${id}/reconnect`, {
        method: 'POST',
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        setError(j?.error || 'Gagal memuat ulang QR')
      }
    } catch {
      setError('Tidak bisa terhubung ke server — cek koneksi internet lalu coba lagi.')
    } finally {
      setRefreshing(false)
    }
  }, [isRefreshing])

  // Reset state saat modal benar-benar tertutup.
  useEffect(() => {
    if (!open) {
      sessionRef.current = null
      setSessionId(null)
      setQrDataUrl(null)
      setQrAt(null)
      setNowTick(0)
      setError(null)
    }
  }, [open])

  // Ticker 1 dtk untuk countdown QR — hanya jalan selama QR tampil.
  useEffect(() => {
    if (!qrDataUrl || qrAt === null) return
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [qrDataUrl, qrAt])

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
                di HP (Pengaturan → Perangkat Tertaut), lalu scan QR baru di
                bawah.
                <br />
              </>
            )}
            Buka WhatsApp di HP → <strong>Pengaturan</strong> →{' '}
            <strong>Perangkat Tertaut</strong> →{' '}
            <strong>Tautkan Perangkat</strong>, lalu pindai QR di bawah.
          </DialogDescription>
        </DialogHeader>

        {/* Saat CONNECTING, QR lama sengaja disembunyikan dan diganti spinner:
            tepat setelah QR dipindai Baileys menutup stream (515) untuk
            restart socket, dan menampilkan QR basi + countdown di momen itu
            bikin user kira scan-nya tidak terbaca. */}
        <div className="bg-muted/30 flex min-h-[320px] items-center justify-center rounded-lg border p-4">
          {error ? (
            <div className="text-center">
              <p className="text-destructive text-sm">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => onOpenChange(false)}
              >
                <X className="mr-2 size-4" /> Tutup
              </Button>
            </div>
          ) : qrDataUrl && status !== 'CONNECTING' ? (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="QR Code WhatsApp"
                width={280}
                height={280}
                className="rounded bg-white p-2"
              />
              {(() => {
                const left =
                  qrAt === null
                    ? QR_TTL_SEC
                    : Math.max(
                        0,
                        QR_TTL_SEC - Math.floor((nowTick - qrAt) / 1000),
                      )
                return left > 0 ? (
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums">
                    <RefreshCw className="size-3" />
                    QR berlaku {left} dtk lagi
                  </p>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-muted-foreground text-xs">
                      QR mungkin sudah kedaluwarsa.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void refreshQr()}
                      disabled={isRefreshing}
                    >
                      {isRefreshing ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 size-4" />
                      )}
                      Muat ulang QR
                    </Button>
                  </div>
                )
              })()}
            </div>
          ) : (
            <div className="text-muted-foreground flex flex-col items-center gap-3 text-center text-sm">
              <Loader2 className="size-8 animate-spin" />
              <span>
                {status === 'CONNECTING'
                  ? 'Menghubungkan ke WhatsApp…'
                  : 'Menyiapkan QR…'}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <RefreshCw className="size-3" />
            Status:{' '}
            <span className="text-foreground font-medium">
              {STATUS_LABEL[status]}
            </span>
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
