// Util CLIENT untuk Facebook JS SDK — dipakai Embedded Signup WhatsApp
// (FB.login dengan config_id). Jalur ini yang didokumentasikan Meta:
// session-info (waba_id / phone_number_id) dikirim ke window pemanggil via
// postMessage, sehingga pemilihan WABA deterministik (bukan tebakan dari
// granular_scopes seperti jalur redirect lama).
//
// Tidak boleh di-import dari server component (menyentuh window/document).

const FACEBOOK_SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js'
const DEFAULT_LOAD_TIMEOUT_MS = 15_000

export interface FbLoginResponse {
  authResponse?: { code?: string } | null
  status?: string
}

export interface FacebookSdk {
  init(options: {
    appId: string
    autoLogAppEvents: boolean
    xfbml: boolean
    version: string
  }): void
  login(cb: (response: FbLoginResponse) => void, options: Record<string, unknown>): void
}

declare global {
  interface Window {
    FB?: FacebookSdk
    fbAsyncInit?: () => void
  }
}

export type FacebookSdkErrorCode = 'FB_SDK_TIMEOUT' | 'FB_SDK_LOAD_FAILED' | 'FB_SDK_UNAVAILABLE'

export class FacebookSdkError extends Error {
  constructor(
    public readonly code: FacebookSdkErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'FacebookSdkError'
  }
}

// Singleton per halaman — SDK cukup dimuat sekali. Di-reset saat gagal supaya
// "Coba lagi" bisa memuat ulang.
let sdkPromise: Promise<FacebookSdk> | null = null

/**
 * Muat & init Facebook JS SDK. Aman dipanggil berulang (singleton). Timeout
 * default 15 dtk — adblocker/jaringan sering membuat script diam tanpa error.
 */
export function loadFacebookSdk(options: {
  appId: string
  version: string
  timeoutMs?: number
}): Promise<FacebookSdk> {
  if (typeof window === 'undefined') {
    return Promise.reject(new FacebookSdkError('FB_SDK_UNAVAILABLE', 'Facebook SDK hanya di browser'))
  }
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS
    let settled = false

    const fail = (err: FacebookSdkError) => {
      if (settled) return
      settled = true
      sdkPromise = null // izinkan retry
      reject(err)
    }
    const succeed = (fb: FacebookSdk) => {
      if (settled) return
      settled = true
      resolve(fb)
    }

    const initAndResolve = (fb: FacebookSdk) => {
      try {
        fb.init({
          appId: options.appId,
          autoLogAppEvents: true,
          xfbml: false,
          version: options.version,
        })
        succeed(fb)
      } catch (err) {
        fail(new FacebookSdkError('FB_SDK_LOAD_FAILED', `FB.init gagal: ${(err as Error).message}`))
      }
    }

    // SDK sudah ada (mis. dimuat halaman lain) → init ulang & selesai.
    if (window.FB) {
      initAndResolve(window.FB)
      return
    }

    const timer = window.setTimeout(() => {
      fail(
        new FacebookSdkError(
          'FB_SDK_TIMEOUT',
          'Facebook SDK tidak termuat — kemungkinan diblokir adblocker/jaringan',
        ),
      )
    }, timeoutMs)

    window.fbAsyncInit = () => {
      window.clearTimeout(timer)
      if (!window.FB) {
        fail(new FacebookSdkError('FB_SDK_LOAD_FAILED', 'Facebook SDK tidak terinisialisasi'))
        return
      }
      initAndResolve(window.FB)
    }

    // Hindari double-inject kalau script sudah ada di DOM (mis. StrictMode).
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${FACEBOOK_SDK_SRC}"]`)
    if (existing) return

    const script = document.createElement('script')
    script.src = FACEBOOK_SDK_SRC
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onerror = () => {
      window.clearTimeout(timer)
      script.remove()
      fail(new FacebookSdkError('FB_SDK_LOAD_FAILED', 'Gagal memuat Facebook SDK'))
    }
    document.body.appendChild(script)
  })

  return sdkPromise
}

/**
 * Buka dialog Embedded Signup. `extras.featureType` mengaktifkan opsi
 * coexistence ("Hubungkan Aplikasi WhatsApp Business") di wizard Meta;
 * `sessionInfoVersion: '3'` supaya event session-info menyertakan waba_id.
 * Resolve `{cancelled:true}` bila user menutup dialog / popup diblokir
 * (Meta memanggil callback tanpa authResponse.code).
 */
export function loginForEmbeddedSignup(
  fb: FacebookSdk,
  options: { configId: string },
): Promise<{ code: string } | { cancelled: true }> {
  return new Promise((resolve) => {
    fb.login(
      (response) => {
        const code = response.authResponse?.code
        resolve(code ? { code } : { cancelled: true })
      },
      {
        config_id: options.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
        },
      },
    )
  })
}

export interface EmbeddedSignupSessionInfo {
  /** FINISH | FINISH_ONLY_WABA | FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING | CANCEL | ... */
  event?: string
  wabaId?: string
  phoneNumberId?: string
  /** Langkah tempat user membatalkan (event CANCEL). */
  currentStep?: string
}

function isMetaOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin)
    return protocol === 'https:' && (hostname === 'facebook.com' || hostname.endsWith('.facebook.com'))
  } catch {
    return false
  }
}

function parseSessionInfo(data: unknown): EmbeddedSignupSessionInfo | null {
  let payload: unknown = data
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      return null
    }
  }
  if (!payload || typeof payload !== 'object') return null
  const p = payload as {
    type?: string
    event?: string
    data?: { waba_id?: string; phone_number_id?: string; current_step?: string }
  }
  if (p.type !== 'WA_EMBEDDED_SIGNUP') return null
  return {
    event: p.event,
    wabaId: p.data?.waba_id,
    phoneNumberId: p.data?.phone_number_id,
    currentStep: p.data?.current_step,
  }
}

/**
 * Dengarkan session-info dari wizard Meta (postMessage origin *.facebook.com).
 * Return fungsi unsubscribe — WAJIB dipanggil saat komponen unmount.
 */
export function subscribeSessionInfo(
  onInfo: (info: EmbeddedSignupSessionInfo) => void,
): () => void {
  const handler = (event: MessageEvent) => {
    if (!isMetaOrigin(event.origin)) return
    const info = parseSessionInfo(event.data)
    if (info) onInfo(info)
  }
  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}

/**
 * Setelah FB.login mengembalikan code, event session-info biasanya sudah
 * tiba — tapi tidak dijamin urutannya. Tunggu sebentar sampai wabaId ada.
 */
export async function waitForSessionInfo(
  get: () => EmbeddedSignupSessionInfo,
  maxWaitMs = 500,
  stepMs = 50,
): Promise<void> {
  const started = Date.now()
  while (!get().wabaId && Date.now() - started < maxWaitMs) {
    await new Promise((r) => setTimeout(r, stepMs))
  }
}
