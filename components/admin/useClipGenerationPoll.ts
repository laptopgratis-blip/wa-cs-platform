'use client'

// Polling list klip selama masih ada yang diproses di background, plus toast
// saat klip selesai (READY) atau gagal (FAILED).
//
// Sejak 2026-10-22 generate klip = background job: POST langsung balas 202,
// pipeline TTS → Kling lipsync (2–4 menit) jalan di server. Tanpa polling, UI
// tetap "0 klip" dan user mengira gagal lalu klik ulang (klip & token dobel).
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  type ClipStatusSnapshot,
  diffClipTransitions,
  isClipInFlight,
  shortErrorText,
} from '@/lib/services/clip-library/clip-job-rules'

const POLL_INTERVAL_MS = 6_000
// Klip yang baru dimulai (202) tapi belum muncul di list — mis. refresh
// pertama kena gangguan sesaat — tetap dipantau selama ini.
const WATCH_MS = 5 * 60_000
// Status yang tidak akan pulih dengan mencoba lagi → polling berhenti.
const FATAL_STATUSES = new Set([401, 403, 404])

interface WatchedClip {
  id: string
  until: number
}

/**
 * `refresh` memuat ulang list dan mengembalikan status HTTP-nya (0 = jaringan).
 * Return `watch(clipId)`: panggil setelah POST start sukses supaya polling
 * jalan walau klip baru belum terlihat di list.
 */
export function useClipGenerationPoll(
  clips: readonly ClipStatusSnapshot[] | null,
  refresh: () => Promise<number>,
): { hasInFlight: boolean; watch: (clipId: string) => void } {
  const previousRef = useRef<Map<string, string> | null>(null)
  const busyRef = useRef(false)
  const [watched, setWatched] = useState<readonly WatchedClip[]>([])
  const [stopped, setStopped] = useState(false)

  const watch = useCallback((clipId: string) => {
    setStopped(false)
    setWatched((prev) => [
      ...prev.filter((w) => w.id !== clipId),
      { id: clipId, until: Date.now() + WATCH_MS },
    ])
  }, [])

  // Toast transisi in-flight → terminal. Snapshot pertama (load halaman)
  // hanya dicatat, tidak dilaporkan.
  useEffect(() => {
    if (!clips) return
    const previous = previousRef.current
    if (previous) {
      for (const t of diffClipTransitions(previous, clips)) {
        if (t.outcome === 'READY') {
          toast.success(`Klip siap tayang: "${t.label}"`)
        } else {
          toast.error(
            `Klip gagal: "${t.label}" — ${shortErrorText(t.errorMessage)}`,
          )
        }
      }
    }
    previousRef.current = new Map(clips.map((c) => [c.id, c.status]))
  }, [clips])

  const hasInFlight = clips?.some((c) => isClipInFlight(c.status)) ?? false
  const waitingForNew = watched.some(
    (w) => !clips?.some((c) => c.id === w.id),
  )
  const shouldPoll = !stopped && (hasInFlight || waitingForNew)

  useEffect(() => {
    if (!shouldPoll) return
    const tick = async () => {
      // Tab tersembunyi: hemat request. Request sebelumnya belum selesai
      // (server lambat): lewati supaya respons tidak saling menimpa.
      if (document.hidden || busyRef.current) return
      busyRef.current = true
      try {
        const status = await refresh()
        if (FATAL_STATUSES.has(status)) {
          setStopped(true)
          toast.error(
            'Gagal memantau status klip — sesi berakhir atau akses berubah. Muat ulang halaman.',
          )
        }
      } finally {
        busyRef.current = false
      }
      const now = Date.now()
      setWatched((prev) =>
        prev.some((w) => w.until <= now)
          ? prev.filter((w) => w.until > now)
          : prev,
      )
    }
    const timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
    const onVisible = () => {
      if (!document.hidden) void tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [shouldPoll, refresh])

  return { hasInFlight, watch }
}
