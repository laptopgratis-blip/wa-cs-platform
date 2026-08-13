'use client'

// Halaman redirect Embedded Signup Meta (dibuka di POPUP dari AddWabaModal).
// Tugasnya: terima ?code=&state= dari Meta → POST /api/whatsapp/waba/exchange
// → beri tahu window pembuka via postMessage → tutup diri.

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { Loader2 } from 'lucide-react'

type Phase = 'processing' | 'success' | 'error'

function notifyOpener(payload: Record<string, unknown>) {
  // Origin-locked: opener adalah halaman /whatsapp di origin yang sama.
  window.opener?.postMessage(payload, window.location.origin)
}

function WabaCallbackInner() {
  const searchParams = useSearchParams()
  const [phase, setPhase] = useState<Phase>('processing')
  const [message, setMessage] = useState('Menghubungkan nomor WhatsApp...')
  const startedRef = useRef(false)

  useEffect(() => {
    // Strict mode dev memanggil effect 2× — exchange code Meta sekali pakai,
    // jadi wajib idempoten di sisi klien.
    if (startedRef.current) return
    startedRef.current = true

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const metaError = searchParams.get('error_description') || searchParams.get('error')

    if (metaError || !code || !state) {
      const err = metaError || 'Proses dibatalkan atau parameter tidak lengkap'
      setPhase('error')
      setMessage(err)
      notifyOpener({ type: 'waba:error', error: err })
      return
    }

    void (async () => {
      try {
        const res = await fetch('/api/whatsapp/waba/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
        })
        // Baca text dulu supaya body non-JSON (mis. halaman error proxy)
        // tetap bisa didiagnosis dari console browser.
        const raw = await res.text()
        let json: {
          success?: boolean
          data?: { sessionId?: string; warning?: string }
          error?: string
        } | null = null
        try {
          json = JSON.parse(raw)
        } catch {
          console.error('[waba-callback] respons bukan JSON:', res.status, raw.slice(0, 300))
        }

        if (json?.success) {
          setPhase('success')
          setMessage(
            json.data?.warning
              ? `Terhubung dengan catatan: ${json.data.warning}`
              : 'Nomor berhasil terhubung! Jendela ini akan tertutup...',
          )
          notifyOpener({ type: 'waba:connected', sessionId: json.data?.sessionId })
          if (!json.data?.warning) setTimeout(() => window.close(), 1_500)
        } else {
          const err = json?.error || `Gagal menghubungkan nomor (HTTP ${res.status})`
          setPhase('error')
          setMessage(err)
          notifyOpener({ type: 'waba:error', error: err })
        }
      } catch {
        setPhase('error')
        setMessage('Tidak bisa menghubungi server — coba lagi')
        notifyOpener({ type: 'waba:error', error: 'network' })
      }
    })()
  }, [searchParams])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      {phase === 'processing' && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
      <p
        className={
          phase === 'error'
            ? 'text-sm text-destructive'
            : 'text-sm text-muted-foreground'
        }
      >
        {message}
      </p>
      {phase !== 'processing' && (
        <button
          type="button"
          onClick={() => window.close()}
          className="text-sm text-primary underline underline-offset-4"
        >
          Tutup jendela ini
        </button>
      )}
    </div>
  )
}

export default function WabaCallbackPage() {
  return (
    <Suspense fallback={null}>
      <WabaCallbackInner />
    </Suspense>
  )
}
