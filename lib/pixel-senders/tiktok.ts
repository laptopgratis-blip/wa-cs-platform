// TikTok Events API sender.
// Endpoint: https://business-api.tiktok.com/open_api/v1.3/event/track/
// Docs: https://business-api.tiktok.com/portal/docs?id=1771101303965185
//
// Mirip Meta CAPI: hash email/phone SHA256, ttclid sebagai click attribution.
// event_source = "web" untuk pixel browser-based.
import { hashSha256 } from '@/lib/pixel-senders/meta'

const TIKTOK_API_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/'

export interface TikTokUserData {
  email?: string | null
  phone?: string | null
  ttclid?: string | null
  ip?: string | null
  userAgent?: string | null
  // Cookie ttp dari pixel browser kalau ada (optional).
  ttp?: string | null
}

export interface TikTokProperties {
  currency?: string
  value?: number
  content_type?: string
  content_id?: string  // single (untuk content_id event)
  contents?: Array<{
    content_id: string
    content_type?: string
    content_name?: string
    quantity?: number
    price?: number
  }>
  query?: string
  description?: string
}

export interface TikTokEventInput {
  pixelId: string
  accessToken: string
  eventName: string
  eventId: string
  eventTime?: number
  userData: TikTokUserData
  properties?: TikTokProperties
  sourceUrl?: string | null
  isTestMode?: boolean
}

export interface TikTokResponse {
  status: number
  body: string
  succeeded: boolean
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export async function sendTikTokEvent(
  input: TikTokEventInput,
): Promise<TikTokResponse> {
  // TikTok Events API minta user di nest:
  //   user: { email: hashed[], phone: hashed[], ttclid, ip, user_agent, ttp }
  // Hash WAJIB SHA256 lowercase. Email & phone juga harus dinormalisasi dulu.
  const user: Record<string, unknown> = {}
  if (input.userData.email) {
    user.email = [hashSha256(normalizeEmail(input.userData.email))]
  }
  if (input.userData.phone) {
    user.phone = [hashSha256(normalizePhone(input.userData.phone))]
  }
  if (input.userData.ttclid) user.ttclid = input.userData.ttclid
  if (input.userData.ip) user.ip = input.userData.ip
  if (input.userData.userAgent) user.user_agent = input.userData.userAgent
  if (input.userData.ttp) user.ttp = input.userData.ttp

  const body: Record<string, unknown> = {
    event_source: 'web',
    event_source_id: input.pixelId,
    data: [
      {
        event: input.eventName,
        event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        user,
        properties: input.properties ?? {},
        page: input.sourceUrl ? { url: input.sourceUrl } : undefined,
      },
    ],
  }
  // Test mode di TikTok = pakai test_event_code (tidak ada di Phase 3
  // initial — bisa di-add belakangan kalau user butuh). Skip dulu.
  if (input.isTestMode) {
    body.test_event_code = 'TEST_MODE'
  }

  try {
    const res = await fetch(TIKTOK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': input.accessToken,
      },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    return {
      status: res.status,
      body: text,
      succeeded: res.status >= 200 && res.status < 300,
    }
  } catch (err) {
    return { status: 0, body: String(err), succeeded: false }
  }
}
