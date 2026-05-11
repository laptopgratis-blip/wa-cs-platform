'use client'

// Popup notifikasi pembeli sebelumnya untuk public order form. Cycle through
// entries dengan interval yang dikonfigurasi seller. Posisi top/bottom.
//
// UX decisions:
// - Mount di atas semua content via fixed positioning (z-50) supaya tidak ke-clip
//   oleh container scroll.
// - Auto-dismiss setiap entry: tampil ~4.5 detik, jeda <intervalSec> sebelum
//   entry berikutnya. Kalau user klik X, popup off untuk sesi ini (sessionStorage).
// - Mobile-friendly: width responsif, max-width supaya tidak overflow.
// - Server data sudah pre-anonymized (firstName + city) — tidak perlu sanitize lagi.
import { CheckCircle2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface ProofEntry {
  name: string
  city: string
  ts: string
}

interface SocialProofPopupProps {
  slug: string
  position: 'top' | 'bottom'
  intervalSec: number
  // Tampilkan timestamp "X hari lalu". Kalau false, popup cuma "Nama dari Kota
  // telah melakukan pembelian" — berguna kalau pembeli terakhir sudah lama
  // supaya tetap berfungsi sebagai social proof tanpa kasih kesan stale.
  showTime?: boolean
}

const VISIBLE_DURATION_MS = 4500
const SESSION_DISMISS_KEY = 'hulao_social_proof_dismissed'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'baru saja'
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'baru saja'
  if (min < 60) return `${min} menit lalu`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} jam lalu`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} hari lalu`
  return 'baru-baru ini'
}

export function SocialProofPopup({
  slug,
  position,
  intervalSec,
  showTime = true,
}: SocialProofPopupProps) {
  const [entries, setEntries] = useState<ProofEntry[]>([])
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const cycleRef = useRef<number>(0)

  // Cek session-level dismiss saat mount supaya popup off kalau user sudah
  // tutup di pageview ini.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_DISMISS_KEY) === slug) {
        setDismissed(true)
      }
    } catch {
      // sessionStorage bisa unavailable di private mode — abaikan, default tampil.
    }
  }, [slug])

  // Fetch sekali saat mount. Endpoint return [] kalau social proof off di server,
  // jadi defensive against rapid toggle.
  useEffect(() => {
    if (dismissed) return
    let cancelled = false
    fetch(`/api/p/social-proof/${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data?.success && Array.isArray(data.data?.entries)) {
          setEntries(data.data.entries)
        }
      })
      .catch(() => {
        // Network error — silent. Social proof bukan kritis.
      })
    return () => {
      cancelled = true
    }
  }, [slug, dismissed])

  // Cycling logic. setTimeout chain (bukan setInterval) supaya bisa pause antar
  // entry: tampil VISIBLE_DURATION_MS → hide → tunggu intervalSec*1000 → tampil
  // entry berikutnya (random pick supaya tidak monoton).
  useEffect(() => {
    if (dismissed || entries.length === 0) return

    let mounted = true
    const intervalMs = Math.max(3, Math.min(30, intervalSec)) * 1000
    let firstShowTimer: ReturnType<typeof setTimeout> | null = null
    let hideTimer: ReturnType<typeof setTimeout> | null = null
    let nextShowTimer: ReturnType<typeof setTimeout> | null = null

    function pickIdx(): number {
      // Round-robin dengan starting offset random supaya beberapa user yang
      // buka di waktu berdekatan tidak lihat urutan persis sama.
      if (cycleRef.current === 0) {
        cycleRef.current = Math.floor(Math.random() * entries.length)
      }
      const idx = cycleRef.current % entries.length
      cycleRef.current = cycleRef.current + 1
      return idx
    }

    function showNext() {
      if (!mounted) return
      setActiveIdx(pickIdx())
      hideTimer = setTimeout(() => {
        if (!mounted) return
        setActiveIdx(null)
        nextShowTimer = setTimeout(showNext, intervalMs)
      }, VISIBLE_DURATION_MS)
    }

    // Delay awal supaya popup tidak langsung muncul saat page load (kasih
    // user kesempatan baca form dulu ~2 detik).
    firstShowTimer = setTimeout(showNext, 2000)

    return () => {
      mounted = false
      if (firstShowTimer) clearTimeout(firstShowTimer)
      if (hideTimer) clearTimeout(hideTimer)
      if (nextShowTimer) clearTimeout(nextShowTimer)
    }
  }, [entries, intervalSec, dismissed])

  function handleDismiss() {
    setDismissed(true)
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, slug)
    } catch {
      // ignore — dismiss tetap berlaku via state untuk sesi component ini.
    }
  }

  if (dismissed || entries.length === 0 || activeIdx === null) return null
  const entry = entries[activeIdx]
  if (!entry) return null

  const positionClass =
    position === 'top'
      ? 'top-4 sm:top-6'
      : 'bottom-4 sm:bottom-6'
  const animationClass =
    position === 'top'
      ? 'animate-[slide-down_0.35s_ease-out]'
      : 'animate-[slide-up_0.35s_ease-out]'

  // Keyframes `slide-up` / `slide-down` di-define di app/globals.css supaya
  // Tailwind v4 + App Router compile ke CSS bundle (styled-jsx tidak reliable
  // di App Router untuk inject @keyframes ke global scope).
  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className={`fixed left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 ${positionClass} ${animationClass}`}
      >
        <div className="flex items-center gap-3 rounded-xl border border-warm-200 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-warm-900">
              <span className="font-bold">{entry.name}</span>
              <span className="text-warm-500"> dari </span>
              <span className="font-bold">{entry.city}</span>
            </p>
            <p className="text-xs text-warm-600">
              telah melakukan pembelian
              {showTime && ` · ${relativeTime(entry.ts)}`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={handleDismiss}
            className="shrink-0 rounded p-1 text-warm-400 hover:bg-warm-100 hover:text-warm-700"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </>
  )
}
