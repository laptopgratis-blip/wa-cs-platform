'use client'

// InlineWaConnect — scan QR WhatsApp langsung di dalam wizard.
// Flow:
//  1. Mount → GET /api/whatsapp/sessions. Kalau ada session CONNECTED →
//     langsung onCompleted. Kalau ada CONNECTING → reuse. Kalau tidak ada →
//     POST /api/whatsapp/connect untuk buat baru.
//  2. Polling /api/whatsapp/[id]/status setiap 2 detik untuk ambil qrDataUrl
//     + status. CONNECTED → trigger onCompleted, stop polling.
//  3. Error / DISCONNECTED → tampilkan tombol "Coba lagi" yang reset session.
//
// Catatan: pakai polling sederhana (bukan Socket.io) supaya lifecycle
// component lebih predictable dan tidak butuh state global di wizard.

import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Smartphone } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

import type { InlineTaskCommonProps } from './InlineTaskHost'

const POLL_INTERVAL_MS = 2000
const MAX_POLL_DURATION_MS = 5 * 60 * 1000 // 5 menit
const TERMINAL_OK = 'CONNECTED'

type WaStatus =
  | 'CONNECTING'
  | 'WAITING_QR'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'AUTH_FAILED'
  | string

interface SessionListItem {
  id: string
  status: WaStatus
  phoneNumber: string | null
  displayName: string | null
}

interface StatusPayload {
  id: string
  status: WaStatus
  phoneNumber: string | null
  displayName: string | null
  qrDataUrl: string | null
}

export function InlineWaConnect({ onCompleted, fallbackHref }: InlineTaskCommonProps) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<WaStatus | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Lock supaya onCompleted hanya dipanggil sekali.
  const completedRef = useRef(false)
  // Mark waktu mulai polling untuk timeout.
  const pollStartRef = useRef<number | null>(null)

  // Bootstrap: cari session aktif atau buat baru.
  const bootstrap = useCallback(async () => {
    setBootstrapping(true)
    setErrorMsg(null)
    try {
      const listRes = await fetch('/api/whatsapp/sessions', { cache: 'no-store' })
      if (listRes.ok) {
        const json = (await listRes.json()) as { success: boolean; data: SessionListItem[] }
        const sessions = json.data ?? []
        // Sudah connected → langsung beres.
        const connected = sessions.find((s) => s.status === TERMINAL_OK)
        if (connected) {
          setSessionId(connected.id)
          setStatus('CONNECTED')
          setPhoneNumber(connected.phoneNumber)
          if (!completedRef.current) {
            completedRef.current = true
            onCompleted()
          }
          setBootstrapping(false)
          return
        }
        // Ada session pending → reuse.
        const pending = sessions.find(
          (s) => s.status === 'CONNECTING' || s.status === 'WAITING_QR',
        )
        if (pending) {
          setSessionId(pending.id)
          setStatus(pending.status)
          pollStartRef.current = Date.now()
          setBootstrapping(false)
          return
        }
      }
      // Tidak ada session → buat baru.
      const createRes = await fetch('/api/whatsapp/connect', { method: 'POST' })
      const createJson = (await createRes.json()) as {
        success: boolean
        data?: { id: string; status: WaStatus }
        error?: string
      }
      if (!createRes.ok || !createJson.success || !createJson.data) {
        setErrorMsg(
          createJson.error ??
            'Tidak bisa mulai sesi WhatsApp. Coba refresh atau buka halaman lengkap.',
        )
        setBootstrapping(false)
        return
      }
      setSessionId(createJson.data.id)
      setStatus(createJson.data.status)
      pollStartRef.current = Date.now()
      setBootstrapping(false)
    } catch (err) {
      console.error('[InlineWaConnect bootstrap]', err)
      setErrorMsg('Tidak bisa hubungi server. Cek koneksi & coba lagi.')
      setBootstrapping(false)
    }
  }, [onCompleted])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  // Polling status.
  useEffect(() => {
    if (!sessionId) return
    if (status === 'CONNECTED') return
    if (completedRef.current) return

    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/whatsapp/${sessionId}/status`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const json = (await res.json()) as { success: boolean; data: StatusPayload }
        if (!json.success) return
        const data = json.data
        setStatus(data.status)
        setQrDataUrl(data.qrDataUrl)
        setPhoneNumber(data.phoneNumber)
        if (data.status === TERMINAL_OK && !completedRef.current) {
          completedRef.current = true
          // Beri user 1 detik untuk lihat success state, lalu advance.
          setTimeout(() => onCompleted(), 1200)
          clearInterval(id)
          return
        }
        if (data.status === 'AUTH_FAILED') {
          setErrorMsg(
            'Otentikasi gagal — biasanya karena QR di-scan oleh akun yang salah.',
          )
          clearInterval(id)
          return
        }
        // Timeout safeguard.
        if (
          pollStartRef.current &&
          Date.now() - pollStartRef.current > MAX_POLL_DURATION_MS
        ) {
          setErrorMsg('Waktu habis. QR sudah kedaluwarsa, klik "Coba lagi".')
          clearInterval(id)
        }
      } catch (err) {
        // Soft fail — biarkan polling berlanjut.
        console.warn('[InlineWaConnect poll]', err)
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(id)
  }, [sessionId, status, onCompleted])

  async function handleRetry() {
    if (sessionId) {
      // Coba reconnect dulu, kalau tidak bisa → bootstrap ulang.
      try {
        await fetch(`/api/whatsapp/${sessionId}/reconnect`, { method: 'POST' })
      } catch {
        /* swallow */
      }
    }
    setSessionId(null)
    setStatus(null)
    setQrDataUrl(null)
    setErrorMsg(null)
    completedRef.current = false
    void bootstrap()
  }

  // ─── Render ─────────────────────────────────────────────────────────

  if (bootstrapping) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-warm-200 bg-warm-50 p-8 text-center">
        <Loader2 className="mb-2 size-6 animate-spin text-primary-500" />
        <p className="text-sm text-warm-600">Menyiapkan QR code…</p>
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-sm text-amber-900">{errorMsg}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleRetry} className="bg-primary-500 hover:bg-primary-600">
            <RefreshCw className="mr-1.5 size-4" /> Coba lagi
          </Button>
          <Button asChild variant="outline">
            <Link href={fallbackHref}>
              <ExternalLink className="mr-1.5 size-4" />
              Buka halaman lengkap
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  if (status === 'CONNECTED') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="size-7" />
        </div>
        <p className="font-display text-lg font-bold text-emerald-900">
          WhatsApp tersambung!
        </p>
        {phoneNumber && (
          <p className="font-mono text-sm text-emerald-700">+{phoneNumber}</p>
        )}
        <p className="text-xs text-emerald-700">Lanjut ke step berikutnya…</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border-2 border-primary-200 bg-card p-5">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* QR */}
        <div className="flex size-56 shrink-0 items-center justify-center rounded-lg border-2 border-warm-200 bg-warm-50">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="QR code WhatsApp"
              className="size-52 rounded"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-warm-500">
              <Loader2 className="size-6 animate-spin" />
              <span className="text-xs">Menunggu QR…</span>
            </div>
          )}
        </div>

        {/* Instructions sisi kanan QR */}
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <Smartphone className="size-5 text-primary-600" />
            <h3 className="font-display text-base font-bold text-warm-900">
              Scan dari HP
            </h3>
          </div>
          <ol className="space-y-1.5 text-sm text-warm-700">
            <li className="flex gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">
                1
              </span>
              Buka WhatsApp di HP
            </li>
            <li className="flex gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">
                2
              </span>
              Tap menu (titik 3) → <strong>Perangkat tertaut</strong>
            </li>
            <li className="flex gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">
                3
              </span>
              Tap <strong>Tautkan perangkat</strong> → arahkan kamera ke QR di
              kiri
            </li>
          </ol>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              <Loader2 className="size-3 animate-spin" />
              {status === 'WAITING_QR' || status === 'CONNECTING'
                ? 'Menunggu kamu scan…'
                : `Status: ${status ?? '—'}`}
            </span>
            <button
              type="button"
              onClick={handleRetry}
              className="text-[11px] text-warm-600 underline hover:text-warm-900"
            >
              Refresh QR
            </button>
          </div>
        </div>
      </div>

      <p className="mt-4 border-t border-warm-200 pt-3 text-center text-[11px] text-warm-500">
        Butuh bantuan?{' '}
        <Link
          href={fallbackHref}
          className="text-primary-600 underline hover:text-primary-700"
        >
          Buka halaman lengkap
        </Link>
      </p>
    </div>
  )
}

