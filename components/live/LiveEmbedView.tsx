'use client'

// LiveEmbedView — wrapper LiveRoomView untuk iframe LP embed.
// Tambah gate modal di atas LiveRoomView sesuai LpLiveEmbed.gateMode.
//
// Mode:
//   REQUIRED — gate blocking di atas video, tidak bisa skip
//   OPTIONAL — gate dengan tombol "Lewati & tonton dulu"
//   HYBRID   — auto-play; gate muncul setelah triggerSec ATAU saat klik area chat
//   OFF      — tidak ada gate (pure tontonan)
//
// Setelah gate submit (atau skip), LiveRoomView terus jalan. Pre-write
// clientSessionId ke sessionStorage agar LiveRoomView pakai ID yang sama.
import { useEffect, useRef, useState } from 'react'

import { LiveRoomView, primeLiveAudio } from './LiveRoomView'

type GateMode = 'REQUIRED' | 'OPTIONAL' | 'HYBRID' | 'OFF'
type GateField = 'name' | 'phone' | 'email' | 'city' | 'productInterest'

interface GateConfig {
  mode: GateMode
  fields: GateField[]
  triggerSec: number
  triggerOnChat: boolean
  autoplay: boolean
  mutedDefault: boolean
}

type LiveRoomViewProps = Parameters<typeof LiveRoomView>[0]

export function LiveEmbedView(
  props: LiveRoomViewProps & {
    gateConfig: GateConfig
    lpId: string
  },
) {
  const { gateConfig, lpId, slug, name } = props
  const [gatePassed, setGatePassed] = useState(gateConfig.mode === 'OFF')
  const [showGateModal, setShowGateModal] = useState(false)
  const sidRef = useRef<string | null>(null)

  // Pre-create clientSessionId di sessionStorage supaya LiveRoomView pakai
  // ID yang sama saat mount. Gate POST butuh sid ini sebelum LiveRoomView jalan.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `live:session:${slug}`
    let id = sessionStorage.getItem(key)
    if (!id) {
      id = (globalThis.crypto?.randomUUID?.() ??
        `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
      sessionStorage.setItem(key, id)
    }
    sidRef.current = id
  }, [slug])

  // Trigger initial gate sesuai mode.
  useEffect(() => {
    if (gateConfig.mode === 'REQUIRED' || gateConfig.mode === 'OPTIONAL') {
      setShowGateModal(true)
    }
  }, [gateConfig.mode])

  // HYBRID timer trigger.
  useEffect(() => {
    if (gateConfig.mode !== 'HYBRID' || gatePassed || gateConfig.triggerSec <= 0) return
    const t = setTimeout(() => setShowGateModal(true), gateConfig.triggerSec * 1000)
    return () => clearTimeout(t)
  }, [gateConfig.mode, gateConfig.triggerSec, gatePassed])

  const handlePass = (lead: { name: string; phone: string }) => {
    // Simpan identity ke localStorage supaya LiveRoomView pre-fill nama+phone.
    try {
      localStorage.setItem(
        `live:identity:${slug}`,
        JSON.stringify({ name: lead.name, phone: lead.phone }),
      )
    } catch {/* localStorage bisa di-block, gpp */}
    setGatePassed(true)
    setShowGateModal(false)
    // Tell parent (LP host) — analytics + scroll behavior.
    try {
      window.parent?.postMessage(
        { type: 'hulao-live:lead-captured', lpId, slug },
        '*',
      )
    } catch {/* ignore */}
  }

  const handleSkip = () => {
    setShowGateModal(false)
    // OPTIONAL: tidak set gatePassed=true, supaya kalau chat klik nanti, gate muncul lagi
  }

  // Block HYBRID chat area sebelum gate passed.
  const showChatBlocker =
    gateConfig.mode === 'HYBRID' && gateConfig.triggerOnChat && !gatePassed && !showGateModal

  return (
    <div className="relative h-screen w-screen touch-manipulation overflow-hidden overscroll-none bg-black">
      <LiveRoomView {...props} />

      {/* HYBRID + triggerOnChat: invisible blocker di area chat untuk capture klik */}
      {showChatBlocker && (
        <div
          className="absolute bottom-0 left-0 right-0 z-30 h-32 cursor-pointer"
          onClick={() => setShowGateModal(true)}
          aria-label="Klik untuk tanya host"
        />
      )}

      {/* REQUIRED: full-screen blocker — di samping modal */}
      {gateConfig.mode === 'REQUIRED' && !gatePassed && (
        <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm" />
      )}

      {/* Gate modal */}
      {showGateModal && (
        <GateModal
          name={name}
          fields={gateConfig.fields}
          mode={gateConfig.mode}
          slug={slug}
          lpId={lpId}
          clientSessionId={sidRef.current}
          onPass={handlePass}
          onSkip={gateConfig.mode === 'OPTIONAL' || gateConfig.mode === 'HYBRID' ? handleSkip : undefined}
        />
      )}
    </div>
  )
}

interface GateModalProps {
  name: string
  fields: GateField[]
  mode: GateMode
  slug: string
  lpId: string
  clientSessionId: string | null
  onPass: (lead: { name: string; phone: string }) => void
  onSkip?: () => void
}

function GateModal({ name, fields, mode, slug, lpId, clientSessionId, onPass, onSkip }: GateModalProps) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fieldLabels: Record<GateField, string> = {
    name: 'Nama kamu',
    phone: 'Nomor WhatsApp',
    email: 'Email (opsional)',
    city: 'Kota',
    productInterest: 'Tertarik produk apa?',
  }
  const fieldPlaceholders: Record<GateField, string> = {
    name: 'contoh: Budi',
    phone: '08123456789',
    email: 'budi@email.com',
    city: 'Jakarta',
    productInterest: 'misal: Cleanoz 1 Box',
  }
  const fieldTypes: Record<GateField, string> = {
    name: 'text',
    phone: 'tel',
    email: 'email',
    city: 'text',
    productInterest: 'text',
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Unlock audio host DI DALAM gesture submit (sebelum await fetch) supaya
    // suara host langsung bunyi tanpa tombol "dengar suara". Element TTS = shared
    // singleton, jadi prime di sini nge-unlock element yang dipakai LiveRoomView.
    primeLiveAudio()
    setError(null)
    if (!clientSessionId) {
      setError('Session belum siap, tunggu sebentar.')
      return
    }
    const required = fields.includes('name') ? form.name?.trim() : 'x'
    const phoneVal = fields.includes('phone') ? form.phone?.trim() : ''
    if (!required || (fields.includes('phone') && !phoneVal)) {
      setError('Lengkapi data dulu ya.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/live/${encodeURIComponent(slug)}/embed-gate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientSessionId,
          lpId,
          name: form.name ?? '',
          phone: form.phone ?? '',
          email: form.email || undefined,
          city: form.city || undefined,
          productInterest: form.productInterest || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Gagal kirim. Coba lagi.')
        setSubmitting(false)
        return
      }
      onPass({ name: form.name ?? '', phone: form.phone ?? '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setSubmitting(false)
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 text-center">
          <div className="text-3xl">🎙️</div>
          <h2 className="mt-2 text-lg font-semibold text-zinc-900">
            Yuk ngobrol dengan host {name}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Isi data biar host bisa kasih info detail langsung ke WA kamu.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map((f) => (
            <div key={f}>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                {fieldLabels[f]}
              </label>
              <input
                type={fieldTypes[f]}
                placeholder={fieldPlaceholders[f]}
                value={form[f] ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, [f]: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                disabled={submitting}
              />
            </div>
          ))}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {submitting ? 'Mengirim…' : 'Mulai chat dengan host'}
          </button>
          {onSkip && mode !== 'REQUIRED' && (
            <button
              type="button"
              onClick={onSkip}
              disabled={submitting}
              className="w-full text-center text-xs text-zinc-500 hover:text-zinc-700"
            >
              Lewati & tonton dulu
            </button>
          )}
        </form>
        <p className="mt-3 text-center text-[10px] text-zinc-400">
          Powered by Hulao Live AI
        </p>
      </div>
    </div>
  )
}
