'use client'

// Hook job optimasi LP AI — POST /optimize (202) lalu polling
// GET /optimize/status tiap 4 dtk sampai DONE/FAILED.
//
// - Polling pakai setTimeout rekursif + token generasi (pola SoulLabManager)
//   supaya unmount / start ulang membatalkan loop lama tanpa race.
// - Error jaringan / 5xx / 429 saat polling = sementara → lanjut polling.
// - Saat mount: cek job RUNNING milik LP (reload / buka tab baru di tengah
//   proses) lalu lanjutkan polling.
// - Batas 20 menit; lewat itu berhenti dan arahkan user ke Riwayat Saran AI.
import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchJson } from '@/lib/fetch-json'

const POLL_INTERVAL_MS = 4_000
const POLL_MAX_MS = 20 * 60_000

export interface OptimizeSuggestion {
  title: string
  rationale: string
  impact: string
}

export interface OptimizationResult {
  optimizationId: string
  suggestions: OptimizeSuggestion[]
  focusAreas: string[]
  scoreBefore: number | null
  scoreAfter: number | null
  rewrittenHtml: string
  cost: {
    inputTokens: number
    outputTokens: number
    providerCostRp: number
    platformTokensCharged: number
  }
}

interface Envelope<T> {
  success: boolean
  data?: T
}

interface StartData {
  optimizationId: string
  status: 'RUNNING'
  alreadyRunning: boolean
  estimate?: { duration?: { label?: string } }
}

type StatusData =
  | { status: 'NONE' }
  | { status: 'RUNNING'; optimizationId: string; elapsedSec: number }
  | { status: 'FAILED'; optimizationId: string; error: string | null }
  | ({ status: 'DONE' } & OptimizationResult)

export type OptimizeJobPhase = 'idle' | 'starting' | 'running'

interface Callbacks {
  onDone: (result: OptimizationResult) => void
  onFailed: (message: string) => void
  onTimeout: () => void
}

function isTransient(status: number): boolean {
  return status === 0 || status === 429 || status >= 500
}

export function useOptimizeJob(lpId: string, callbacks: Callbacks) {
  const [phase, setPhase] = useState<OptimizeJobPhase>('idle')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [durationLabel, setDurationLabel] = useState<string | null>(null)

  const callbacksRef = useRef(callbacks)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)

  useEffect(() => {
    callbacksRef.current = callbacks
  })

  const base = `/api/lp/${encodeURIComponent(lpId)}/optimize`

  const stopPolling = useCallback(() => {
    generationRef.current += 1
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const finish = useCallback(() => {
    stopPolling()
    setPhase('idle')
    setStartedAt(null)
  }, [stopPolling])

  const startPolling = useCallback(
    (optimizationId: string, jobStartedAt: number) => {
      stopPolling()
      const generation = generationRef.current
      const url = `${base}/status?id=${encodeURIComponent(optimizationId)}`
      const schedule = () => {
        timerRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS)
      }

      async function tick(): Promise<void> {
        if (generation !== generationRef.current) return
        if (Date.now() - jobStartedAt > POLL_MAX_MS) {
          finish()
          callbacksRef.current.onTimeout()
          return
        }
        const r = await fetchJson<Envelope<StatusData>>(url, {
          cache: 'no-store',
        })
        if (generation !== generationRef.current) return
        if (!r.ok) {
          if (isTransient(r.status)) return schedule()
          finish()
          callbacksRef.current.onFailed(
            r.error ?? 'Gagal memuat status optimasi.',
          )
          return
        }
        const d = r.data?.data
        if (!d || d.status === 'RUNNING' || d.status === 'NONE') {
          if (d?.status === 'RUNNING')
            setStartedAt(Date.now() - d.elapsedSec * 1000)
          return schedule()
        }
        finish()
        if (d.status === 'DONE') callbacksRef.current.onDone(d)
        else
          callbacksRef.current.onFailed(
            d.error ?? 'Optimasi AI gagal. Silakan coba lagi.',
          )
      }

      schedule()
    },
    [base, finish, stopPolling],
  )

  // Lanjutkan job yang masih berjalan (reload / tab lain).
  useEffect(() => {
    let cancelled = false
    void fetchJson<Envelope<StatusData>>(`${base}/status`, {
      cache: 'no-store',
    }).then((r) => {
      const d = r.data?.data
      if (cancelled || !r.ok || d?.status !== 'RUNNING') return
      const jobStartedAt = Date.now() - d.elapsedSec * 1000
      setStartedAt(jobStartedAt)
      setPhase('running')
      startPolling(d.optimizationId, jobStartedAt)
    })
    return () => {
      cancelled = true
      stopPolling()
    }
  }, [base, startPolling, stopPolling])

  // Timer "berjalan m:ss" untuk UI.
  useEffect(() => {
    if (phase !== 'running' || startedAt === null) return
    const update = () =>
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [phase, startedAt])

  const start = useCallback(async (): Promise<{
    alreadyRunning: boolean
  } | null> => {
    setPhase('starting')
    const r = await fetchJson<Envelope<StartData>>(
      base,
      { method: 'POST' },
      'Gagal memulai optimasi AI.',
    )
    const d = r.data?.data
    if (!r.ok || !d) {
      setPhase('idle')
      callbacksRef.current.onFailed(r.error ?? 'Gagal memulai optimasi AI.')
      return null
    }
    const jobStartedAt = Date.now()
    setDurationLabel(d.estimate?.duration?.label ?? null)
    setStartedAt(jobStartedAt)
    setElapsedSec(0)
    setPhase('running')
    startPolling(d.optimizationId, jobStartedAt)
    return { alreadyRunning: d.alreadyRunning }
  }, [base, startPolling])

  return { phase, elapsedSec, durationLabel, start }
}

export function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
