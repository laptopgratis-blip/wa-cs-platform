// Adapter pengiriman/lifecycle WhatsApp — dispatcher per provider sesi:
// - BAILEYS   → HTTP ke wa-service (perilaku lama, tidak berubah)
// - CLOUD_API → langsung Graph API Meta (lib/services/waba/*)
// Semua pemanggil tetap memakai interface `waService` yang sama.
// KONTRAK PENTING: tidak ada method yang boleh throw — pemanggil (mis. cron
// followup) mengandalkan bentuk { success:false, error } saat gagal.

import type { WaProvider, WaStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sendCloudText } from '@/lib/services/waba/send'
import { sendCloudTemplate, type SendCloudTemplateInput } from '@/lib/services/waba/send-template'

const BASE = process.env.WA_SERVICE_URL || 'http://localhost:3001'
const SECRET = process.env.WA_SERVICE_SECRET || ''

// Mirror tipe dari wa-service/src/types.ts (status sinkron dengan Prisma).
export interface WaServiceSession {
  sessionId: string
  status: WaStatus
  phoneNumber: string | null
  displayName: string | null
  qr: string | null
  qrDataUrl: string | null
  lastError: string | null
  updatedAt: string
}

interface ServiceResponse<T> {
  success: boolean
  data?: T
  error?: string
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<ServiceResponse<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(SECRET ? { 'x-service-secret': SECRET } : {}),
        ...init.headers,
      },
      // wa-service jalan di jaringan lokal — jangan di-cache.
      cache: 'no-store',
      // Timeout wajib: kalau wa-service macet (mis. GC thrashing saat OOM),
      // tanpa ini request Next ikut menggantung > 100 dtk → Cloudflare 524
      // (halaman HTML) → browser error "unexpected token '<'" alih-alih
      // pesan error JSON yang jelas.
      signal: init.signal ?? AbortSignal.timeout(15_000),
    })
    const json = (await res.json().catch(() => null)) as ServiceResponse<T> | null
    if (!json) {
      return { success: false, error: `wa-service: respons tidak valid (${res.status})` }
    }
    return json
  } catch (err) {
    return {
      success: false,
      error: `wa-service tidak bisa dihubungi: ${(err as Error).message}`,
    }
  }
}

// Cache provider per sesi (30 dtk) — sendMessage dipanggil beruntun oleh
// cron followup/broadcast; jangan query DB tiap pesan. Provider praktis
// tidak pernah berubah selama sesi hidup.
const PROVIDER_CACHE_TTL_MS = 30_000
const providerCache = new Map<string, { provider: WaProvider; at: number }>()

async function resolveProvider(sessionId: string): Promise<WaProvider> {
  const cached = providerCache.get(sessionId)
  if (cached && Date.now() - cached.at < PROVIDER_CACHE_TTL_MS) return cached.provider
  try {
    const row = await prisma.whatsappSession.findUnique({
      where: { id: sessionId },
      select: { provider: true },
    })
    // Sesi tidak ditemukan → anggap BAILEYS: jalur lama yang akan
    // menghasilkan error "session not found" dari wa-service (perilaku lama).
    const provider = row?.provider ?? 'BAILEYS'
    providerCache.set(sessionId, { provider, at: Date.now() })
    return provider
  } catch (err) {
    // DB error tidak boleh mematahkan kontrak never-throw — fallback jalur lama.
    console.error('[wa-service] resolveProvider gagal:', err)
    return 'BAILEYS'
  }
}

// Sintesis WaServiceSession dari row DB — sesi Cloud API tidak punya state
// in-memory di wa-service, DB adalah sumber kebenarannya.
async function cloudStatus(sessionId: string): Promise<ServiceResponse<WaServiceSession>> {
  try {
    const s = await prisma.whatsappSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        phoneNumber: true,
        displayName: true,
        lastError: true,
        updatedAt: true,
      },
    })
    if (!s) return { success: false, error: 'Sesi tidak ditemukan' }
    return {
      success: true,
      data: {
        sessionId: s.id,
        status: s.status,
        phoneNumber: s.phoneNumber,
        displayName: s.displayName,
        qr: null,
        qrDataUrl: null,
        lastError: s.lastError,
        updatedAt: s.updatedAt.toISOString(),
      },
    }
  } catch (err) {
    return { success: false, error: `Gagal baca status sesi: ${(err as Error).message}` }
  }
}

export const waService = {
  async connect(sessionId: string) {
    if ((await resolveProvider(sessionId)) === 'CLOUD_API') {
      return {
        success: false,
        error: 'Sesi Cloud API tidak memakai QR pairing — kelola koneksi via Embedded Signup',
      } satisfies ServiceResponse<WaServiceSession>
    }
    return request<WaServiceSession>('/sessions/connect', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })
  },
  async disconnect(sessionId: string, wipe = false) {
    if ((await resolveProvider(sessionId)) === 'CLOUD_API') {
      // Route disconnect menangani sesi cloud sendiri (update DB) — sampai
      // di sini berarti pemanggil salah jalur; tolak defensif.
      return {
        success: false,
        error: 'Sesi Cloud API diputus lewat route disconnect, bukan wa-service',
      } satisfies ServiceResponse<WaServiceSession | null>
    }
    return request<WaServiceSession | null>('/sessions/disconnect', {
      method: 'POST',
      body: JSON.stringify({ sessionId, wipe }),
    })
  },
  async status(sessionId: string) {
    if ((await resolveProvider(sessionId)) === 'CLOUD_API') {
      return cloudStatus(sessionId)
    }
    return request<WaServiceSession>(`/sessions/${encodeURIComponent(sessionId)}`)
  },
  async sendMessage(sessionId: string, phoneNumber: string, content: string) {
    if ((await resolveProvider(sessionId)) === 'CLOUD_API') {
      return sendCloudText({ sessionId, phoneNumber, content })
    }
    return request<{
      sessionId: string
      phoneNumber: string
      messageId: string | null
    }>(`/sessions/${encodeURIComponent(sessionId)}/send-message`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, content }),
    })
  },
  /**
   * Kirim pesan TEMPLATE Meta (hanya sesi CLOUD_API). Baileys tidak punya
   * konsep template → ditolak jelas; pemanggil non-CS pakai smartSend.
   */
  async sendTemplate(input: SendCloudTemplateInput) {
    if ((await resolveProvider(input.sessionId)) !== 'CLOUD_API') {
      return {
        success: false,
        error: 'Template Meta hanya untuk sesi Cloud API — sesi Baileys kirim teks biasa',
        code: 'SESSION_UNAVAILABLE' as const,
      }
    }
    return sendCloudTemplate(input)
  },
  async startBroadcast(input: {
    sessionId: string
    broadcastId: string
    items: { phoneNumber: string; content: string }[]
  }) {
    if ((await resolveProvider(input.sessionId)) === 'CLOUD_API') {
      return {
        success: false,
        error:
          'Broadcast belum didukung untuk sesi Cloud API — butuh template ter-approve Meta (increment berikutnya)',
      } satisfies ServiceResponse<{ broadcastId: string; total: number }>
    }
    return request<{ broadcastId: string; total: number }>(
      `/sessions/${encodeURIComponent(input.sessionId)}/broadcast`,
      {
        method: 'POST',
        body: JSON.stringify({
          broadcastId: input.broadcastId,
          items: input.items,
        }),
      },
    )
  },
  cancelBroadcast(broadcastId: string) {
    return request<{ broadcastId: string; cancelled: boolean }>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/cancel`,
      { method: 'POST' },
    )
  },
}
