'use client'

// State machine Embedded Signup via FB JS SDK (dipakai AddWabaModal).
//   idle → preparing (POST signup + preload SDK) → ready → meta (FB.login,
//   wizard Meta) → exchanging (POST /exchange) → success | error
// SDK & state di-preload saat modal dibuka supaya FB.login terpanggil hampir
// sinkron dalam gesture klik (popup tidak diblokir browser).

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  FacebookSdkError,
  loadFacebookSdk,
  loginForEmbeddedSignup,
  subscribeSessionInfo,
  waitForSessionInfo,
  type EmbeddedSignupSessionInfo,
  type FacebookSdk,
} from '@/lib/facebook-sdk'

export type SignupPhase =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'meta'
  | 'exchanging'
  | 'success'
  | 'error'

export type WarningCode =
  | 'PIN_MISMATCH'
  | 'PIN_RATE_LIMIT'
  | 'NUMBER_STILL_ATTACHED'
  | 'OTHER'
  | 'REGISTER_FAILED'
  | 'WEBHOOK_FAILED'

export interface ExchangeResult {
  sessionId: string
  phoneNumber: string | null
  displayName: string | null
  mode: 'COEXISTENCE' | 'STANDARD'
  generatedPin?: string
  syncScheduled: boolean
  warning?: string
  warningCode?: WarningCode
}

interface SignupConfig {
  appId: string
  configId: string
  graphVersion: string
  state: string
  issuedAt: number
}

// State server berumur 30 menit; refresh kalau sudah agak tua sebelum dipakai
// supaya wizard panjang tidak berakhir "state kedaluwarsa".
const STATE_REFRESH_AFTER_MS = 8 * 60 * 1000

async function fetchSignupConfig(): Promise<SignupConfig> {
  const res = await fetch('/api/whatsapp/waba/signup', { method: 'POST' })
  const json = (await res.json().catch(() => null)) as {
    success?: boolean
    data?: Omit<SignupConfig, 'issuedAt'>
    error?: string
  } | null
  if (!json?.success || !json.data) {
    throw new Error(json?.error || 'Gagal memulai proses hubungkan')
  }
  return { ...json.data, issuedAt: Date.now() }
}

function describeSdkError(err: unknown): string {
  if (err instanceof FacebookSdkError) {
    if (err.code === 'FB_SDK_TIMEOUT' || err.code === 'FB_SDK_LOAD_FAILED') {
      return (
        'Tidak bisa memuat Facebook SDK — kemungkinan diblokir adblocker/jaringan. ' +
        'Nonaktifkan adblocker untuk hulao lalu klik "Coba lagi", atau pakai browser lain.'
      )
    }
  }
  return (err as Error)?.message || 'Terjadi kesalahan'
}

export function useEmbeddedSignup(open: boolean) {
  const [phase, setPhase] = useState<SignupPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExchangeResult | null>(null)

  const configRef = useRef<SignupConfig | null>(null)
  const sdkRef = useRef<FacebookSdk | null>(null)
  const sessionInfoRef = useRef<EmbeddedSignupSessionInfo>({})
  // Abaikan callback FB.login / fetch yang datang setelah modal ditutup.
  const activeRef = useRef(false)
  const preparingRef = useRef(false)

  const prepare = useCallback(async () => {
    if (preparingRef.current) return
    preparingRef.current = true
    setPhase('preparing')
    setError(null)
    try {
      const cfg = await fetchSignupConfig()
      if (!activeRef.current) return
      configRef.current = cfg
      // Preload SDK — kegagalan di sini bukan blocker; dicoba lagi saat launch.
      try {
        sdkRef.current = await loadFacebookSdk({ appId: cfg.appId, version: cfg.graphVersion })
      } catch (err) {
        console.warn('[waba] preload SDK gagal (dicoba lagi saat klik):', err)
      }
      if (activeRef.current) setPhase('ready')
    } catch (err) {
      if (!activeRef.current) return
      setError((err as Error).message)
      setPhase('error')
    } finally {
      preparingRef.current = false
    }
  }, [])

  // Lifecycle: saat modal dibuka → prepare + pasang listener session-info.
  useEffect(() => {
    if (!open) {
      activeRef.current = false
      return
    }
    activeRef.current = true
    sessionInfoRef.current = {}
    setResult(null)
    void prepare()
    const unsubscribe = subscribeSessionInfo((info) => {
      // Merge — nilai lama tidak ditimpa undefined (event bertahap).
      sessionInfoRef.current = {
        event: info.event ?? sessionInfoRef.current.event,
        wabaId: info.wabaId ?? sessionInfoRef.current.wabaId,
        phoneNumberId: info.phoneNumberId ?? sessionInfoRef.current.phoneNumberId,
        currentStep: info.currentStep ?? sessionInfoRef.current.currentStep,
      }
    })
    return () => {
      activeRef.current = false
      unsubscribe()
    }
  }, [open, prepare])

  const launch = useCallback(
    async (opts: { pin?: string }): Promise<{ cancelled?: boolean }> => {
      setError(null)
      try {
        // Pastikan config & SDK siap (mungkin preload gagal / state tua).
        let cfg = configRef.current
        if (!cfg || Date.now() - cfg.issuedAt > STATE_REFRESH_AFTER_MS) {
          cfg = await fetchSignupConfig()
          configRef.current = cfg
        }
        let sdk = sdkRef.current
        if (!sdk) {
          sdk = await loadFacebookSdk({ appId: cfg.appId, version: cfg.graphVersion })
          sdkRef.current = sdk
        }
        if (!activeRef.current) return {}

        sessionInfoRef.current = {}
        setPhase('meta')
        const login = await loginForEmbeddedSignup(sdk, { configId: cfg.configId })
        if (!activeRef.current) return {}
        if ('cancelled' in login) {
          setPhase('ready')
          return { cancelled: true }
        }

        await waitForSessionInfo(() => sessionInfoRef.current)
        setPhase('exchanging')
        const info = sessionInfoRef.current
        const res = await fetch('/api/whatsapp/waba/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: login.code,
            state: cfg.state,
            wabaId: info.wabaId,
            phoneNumberId: info.phoneNumberId,
            pin: opts.pin || undefined,
          }),
        })
        const json = (await res.json().catch(() => null)) as {
          success?: boolean
          data?: ExchangeResult
          error?: string
        } | null
        if (!activeRef.current) return {}
        if (!json?.success || !json.data) {
          throw new Error(json?.error || `Gagal menghubungkan nomor (HTTP ${res.status})`)
        }
        setResult(json.data)
        setPhase('success')
        // State sekali pakai — paksa refresh untuk percobaan berikutnya.
        configRef.current = null
        return {}
      } catch (err) {
        if (!activeRef.current) return {}
        setError(describeSdkError(err))
        setPhase('error')
        return {}
      }
    },
    [],
  )

  const retryRegister = useCallback(async (pin: string): Promise<boolean> => {
    if (!result) return false
    setError(null)
    const res = await fetch('/api/whatsapp/waba/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: result.sessionId, pin }),
    })
    const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null
    if (!json?.success) {
      setError(json?.error || 'Register ulang gagal')
      return false
    }
    setResult({ ...result, warning: undefined, warningCode: undefined })
    return true
  }, [result])

  const reset = useCallback(() => {
    setPhase('idle')
    setError(null)
    setResult(null)
    configRef.current = null
  }, [])

  return { phase, error, result, launch, retryRegister, reset, retryPrepare: prepare }
}
