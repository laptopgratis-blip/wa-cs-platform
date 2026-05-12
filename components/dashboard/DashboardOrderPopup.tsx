'use client'

// Popup notifikasi order baru untuk SELLER dashboard. Beda dengan
// SocialProofPopup public:
// - Mount global di dashboard layout (semua halaman /dashboard/*).
// - Poll private endpoint /api/dashboard/order-popup/recent tiap 30 detik.
// - Show notif HANYA untuk order baru (yang belum di-mark "seen") — tidak
//   replay order lama tiap re-mount.
// - Full data (nama lengkap + kota + total Rp + status), tidak anonim.
// - Tujuan: kasih feedback positif ke seller saat ada order masuk — biar
//   semangat ngerjain.
//
// State strategy:
// - `lastSeenOrderId` di-persist sessionStorage (per tab supaya tidak
//   re-popup saat navigate antar halaman). Initial = id terbaru saat
//   mount (skip baseline order — popup hanya untuk order benar-benar baru
//   selama dashboard terbuka).
// - Queue dipakai supaya kalau ada 3 order datang barengan di 1 poll
//   cycle, popup tampil bergantian (bukan numpuk).
import { CheckCircle2, ShoppingBag, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  type NotificationSound,
  playNotificationSound,
} from '@/lib/utils/notification-sound'

interface RecentOrder {
  id: string
  name: string
  city: string
  status: string
  totalRp: number
  ts: string
}

interface DashboardOrderPopupProps {
  enabled: boolean
  sound: NotificationSound | 'off'
}

const POLL_INTERVAL_MS = 30_000
const VISIBLE_DURATION_MS = 6000
const SESSION_KEY = 'hulao_dashboard_last_seen_order'

function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString('id-ID')}`
}

export function DashboardOrderPopup({ enabled, sound }: DashboardOrderPopupProps) {
  const [queue, setQueue] = useState<RecentOrder[]>([])
  const [active, setActive] = useState<RecentOrder | null>(null)
  const lastSeenRef = useRef<string | null>(null)
  const dismissedRef = useRef(false)

  // Init: ambil lastSeen dari sessionStorage (kalau navigate antar halaman,
  // tidak re-popup order lama).
  useEffect(() => {
    if (!enabled) return
    try {
      const stored = sessionStorage.getItem(SESSION_KEY)
      if (stored) lastSeenRef.current = stored
    } catch {
      // ignore
    }
  }, [enabled])

  // Polling cycle. Setiap 30 detik fetch recent order. Order yang id-nya
  // lebih baru dari lastSeen → masuk queue tampil.
  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function poll() {
      if (cancelled || dismissedRef.current) return
      try {
        const res = await fetch('/api/dashboard/order-popup/recent', {
          cache: 'no-store',
        })
        if (!res.ok) return
        const json = (await res.json()) as {
          success: boolean
          data?: { orders: RecentOrder[] }
        }
        if (!json.success || !json.data?.orders) return
        const orders = json.data.orders
        if (orders.length === 0) return

        // Order endpoint sudah desc by createdAt. orders[0] paling baru.
        if (lastSeenRef.current === null) {
          // Baseline: tandai newest sebagai "seen" supaya tidak spam popup
          // order lama saat pertama buka dashboard.
          lastSeenRef.current = orders[0].id
          try {
            sessionStorage.setItem(SESSION_KEY, orders[0].id)
          } catch {
            // ignore
          }
          return
        }

        // Cari order baru (lebih baru dari lastSeen). Karena order desc,
        // iterasi sampai ketemu lastSeen.
        const fresh: RecentOrder[] = []
        for (const o of orders) {
          if (o.id === lastSeenRef.current) break
          fresh.push(o)
        }
        if (fresh.length > 0) {
          // Reverse supaya tampil oldest-first (sesuai urutan kejadian).
          setQueue((q) => [...q, ...fresh.reverse()])
          lastSeenRef.current = orders[0].id
          try {
            sessionStorage.setItem(SESSION_KEY, orders[0].id)
          } catch {
            // ignore
          }
        }
      } catch {
        // Network error — silent, retry next cycle.
      }
    }

    // First poll segera supaya baseline ke-set.
    void poll()
    const interval = window.setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [enabled])

  // Effect A: pick next dari queue kalau slot aktif kosong. Cleanup TIDAK
  // di-return supaya re-run effect ini (akibat state changes oleh effect ini
  // sendiri) tidak ngebatalin timer dari Effect B.
  useEffect(() => {
    if (active !== null) return
    if (queue.length === 0) return
    const next = queue[0]
    setActive(next)
    setQueue((q) => q.slice(1))
    if (sound !== 'off') {
      playNotificationSound(sound)
    }
  }, [queue, active, sound])

  // Effect B: auto-hide setelah VISIBLE_DURATION_MS. Dep cuma `active` —
  // timer set saat active jadi non-null, cleared saat active jadi null
  // (unmount atau hide manual). Pisah dari Effect A supaya re-render karena
  // queue updates tidak ngebatalin timer ini.
  useEffect(() => {
    if (active === null) return
    const hideTimer = window.setTimeout(() => {
      setActive(null)
    }, VISIBLE_DURATION_MS)
    return () => window.clearTimeout(hideTimer)
  }, [active])

  // Catatan: tidak ada Effect C untuk gap antar popup — Effect A langsung
  // pick next saat active=null. Total: 5 popup × 6 detik = 30 detik, dengan
  // transisi langsung. Cukup terlihat user; gap explisit malah bikin logic
  // ribet (infinite re-render loop kalau pakai setQueue([...q])).

  function dismiss() {
    setActive(null)
    setQueue([])
    dismissedRef.current = true
  }

  if (!enabled || !active) return null

  const isPaid = active.status === 'PAID'
  const statusBadge = isPaid ? '💰 Pembayaran masuk' : '🛒 Order baru'
  const badgeColor = isPaid
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-amber-100 text-amber-700'
  const Icon = isPaid ? CheckCircle2 : ShoppingBag

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 top-4 z-[60] w-[calc(100vw-2rem)] max-w-sm animate-[slide-down_0.35s_ease-out] sm:right-6 sm:top-6"
    >
      <div className="overflow-hidden rounded-xl border border-warm-200 bg-white shadow-xl">
        <div className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold ${badgeColor}`}>
          <Icon className="size-3.5" />
          <span className="flex-1">{statusBadge}</span>
          <button
            type="button"
            aria-label="Tutup"
            onClick={dismiss}
            className="rounded p-0.5 hover:bg-black/5"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="space-y-1 px-3 py-2.5">
          <p className="text-sm font-semibold text-warm-900">
            {active.name}
            {active.city && (
              <>
                <span className="font-normal text-warm-500"> dari </span>
                {active.city}
              </>
            )}
          </p>
          <p className="text-base font-bold text-warm-900">
            {formatRupiah(active.totalRp)}
          </p>
        </div>
      </div>
    </div>
  )
}
