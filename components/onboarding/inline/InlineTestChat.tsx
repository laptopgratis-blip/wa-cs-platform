'use client'

// InlineTestChat — instruksi test chat ke nomor bot. Tampilkan nomor WA bot
// (dari /api/whatsapp/sessions yang CONNECTED), tombol click-to-copy, plus
// polling /api/inbox setiap 5 detik untuk auto-detect kalau ada percakapan
// masuk. Auto-advance saat detect, atau user bisa klik manual "Tandai
// sudah dites".

import {
  CheckCircle2,
  Copy,
  Loader2,
  MessageCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import type { InlineTaskCommonProps } from './InlineTaskHost'

const POLL_INTERVAL_MS = 5000
const MAX_POLL_DURATION_MS = 5 * 60 * 1000 // 5 menit

interface SessionLite {
  id: string
  status: string
  phoneNumber: string | null
}

interface InboxItem {
  id: string
}

export function InlineTestChat({
  onCompleted,
  fallbackHref,
}: InlineTaskCommonProps) {
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const baselineCountRef = useRef<number | null>(null)
  const completedRef = useRef(false)
  const pollStartRef = useRef<number | null>(null)

  // Bootstrap: ambil nomor WA bot + baseline jumlah kontak sekarang.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [sesRes, inboxRes] = await Promise.all([
          fetch('/api/whatsapp/sessions', { cache: 'no-store' }),
          fetch('/api/inbox?filter=all', { cache: 'no-store' }),
        ])
        if (cancelled) return
        if (sesRes.ok) {
          const json = (await sesRes.json()) as {
            success: boolean
            data: SessionLite[]
          }
          const connected = json.data?.find((s) => s.status === 'CONNECTED')
          if (connected?.phoneNumber) {
            setPhoneNumber(connected.phoneNumber)
          } else {
            setErrorMsg(
              'Belum ada nomor WhatsApp tersambung. Selesaikan step "Hubungkan WhatsApp" dulu.',
            )
          }
        }
        if (inboxRes.ok) {
          const ij = (await inboxRes.json()) as {
            success: boolean
            data: InboxItem[] | { items: InboxItem[] }
          }
          // jsonOk wrapper bisa balik {items: []} atau langsung [].
          const items = Array.isArray(ij.data)
            ? ij.data
            : ((ij.data as { items: InboxItem[] })?.items ?? [])
          baselineCountRef.current = items.length
        }
      } catch (err) {
        console.warn('[InlineTestChat bootstrap]', err)
      } finally {
        if (!cancelled) {
          setBootstrapping(false)
          pollStartRef.current = Date.now()
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Polling: cek apakah jumlah kontak inbox bertambah → ada chat masuk.
  useEffect(() => {
    if (bootstrapping) return
    if (errorMsg) return
    if (completedRef.current) return

    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/inbox?filter=all', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as {
          success: boolean
          data: InboxItem[] | { items: InboxItem[] }
        }
        const items = Array.isArray(json.data)
          ? json.data
          : ((json.data as { items: InboxItem[] })?.items ?? [])
        const baseline = baselineCountRef.current ?? 0
        if (items.length > baseline && !completedRef.current) {
          completedRef.current = true
          setDone(true)
          toast.success('Pesan terdeteksi — bot sudah dites!')
          setTimeout(() => onCompleted(), 1200)
          clearInterval(id)
          return
        }
        if (
          pollStartRef.current &&
          Date.now() - pollStartRef.current > MAX_POLL_DURATION_MS
        ) {
          clearInterval(id)
        }
      } catch (err) {
        console.warn('[InlineTestChat poll]', err)
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(id)
  }, [bootstrapping, errorMsg, onCompleted])

  async function handleManualComplete() {
    if (submitting || completedRef.current) return
    setSubmitting(true)
    completedRef.current = true
    setDone(true)
    setTimeout(() => onCompleted(), 600)
  }

  async function handleCopy() {
    if (!phoneNumber) return
    try {
      await navigator.clipboard.writeText(phoneNumber)
      toast.success('Nomor disalin')
    } catch {
      toast.error('Gagal salin — copy manual saja')
    }
  }

  if (bootstrapping) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-warm-200 bg-warm-50 p-6 text-center">
        <Loader2 className="mb-2 size-5 animate-spin text-primary-500" />
        <p className="text-xs text-warm-600">Menyiapkan info bot…</p>
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
        <p className="text-sm text-amber-900">{errorMsg}</p>
        <p className="text-xs text-amber-700">
          Selesaikan step &ldquo;Hubungkan WhatsApp&rdquo; sebelumnya, lalu balik
          ke step ini.
        </p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="size-6" />
        </div>
        <p className="font-display text-base font-bold text-emerald-900">
          Test chat selesai
        </p>
        <p className="text-xs text-emerald-700">Lanjut ke step berikutnya…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border-2 border-primary-200 bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
          <MessageCircle className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-base font-bold text-warm-900">
            Chat ke nomor di bawah dari HP pribadimu
          </h3>
          <p className="mt-1 text-xs text-warm-600">
            Pakai nomor pribadi (bukan dari HP yang nomornya sama dengan bot)
            untuk kirim pesan apa saja, mis. <em>&ldquo;Halo, ada
            stok?&rdquo;</em>. AI akan balas otomatis.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-warm-50 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-warm-500">
          Nomor bot kamu
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-lg font-bold text-warm-900">
            +{phoneNumber}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-md p-1.5 text-warm-500 transition-colors hover:bg-warm-200 hover:text-warm-900"
            title="Salin nomor"
          >
            <Copy className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
        <Loader2 className="size-3 shrink-0 animate-spin" />
        Sistem auto-detect saat pesan masuk. Atau klik manual kalau sudah selesai.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleManualComplete}
          disabled={submitting}
          variant="outline"
        >
          <CheckCircle2 className="mr-1.5 size-4" />
          Sudah saya tes — tandai selesai
        </Button>
      </div>
    </div>
  )
}
