// Meta Conversions API (CAPI) sender.
// Endpoint: https://graph.facebook.com/v19.0/<pixel_id>/events
// Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
//
// Meta minta user_data di-hash SHA256 (kecuali fbc/fbp/IP/UA). Phone &
// email harus normalized + lowercased dulu sebelum hash.
import { createHash } from 'node:crypto'

const META_API_VERSION = 'v19.0'

export interface MetaUserData {
  email?: string | null
  phone?: string | null
  fbclid?: string | null
  clientIpAddress?: string | null
  clientUserAgent?: string | null
  // Cookie _fbp dari browser (kalau ada).
  fbp?: string | null
}

export interface MetaCustomData {
  currency?: string
  value?: number
  content_type?: string
  content_ids?: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contents?: Array<{ id: string; quantity: number; item_price?: number }>
  num_items?: number
}

export interface MetaEventInput {
  pixelId: string
  accessToken: string
  testEventCode?: string | null
  eventName: string
  eventId: string
  eventTime?: number  // unix seconds
  userData: MetaUserData
  customData?: MetaCustomData
  sourceUrl?: string | null
}

export interface MetaResponse {
  status: number
  body: string
  succeeded: boolean
}

export function hashSha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function normalizePhone(phone: string): string {
  // Hapus non-digit. Meta minta full international number tanpa "+".
  return phone.replace(/\D/g, '')
}

// Format fbc parameter sesuai spec Meta:
//   "fb.{subdomain_index}.{creation_time}.{fbclid}"
// subdomain_index = 1 untuk top-level.
function composeFbc(fbclid: string): string {
  return `fb.1.${Date.now()}.${fbclid}`
}

export async function sendMetaEvent(
  input: MetaEventInput,
): Promise<MetaResponse> {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(
    input.pixelId,
  )}/events?access_token=${encodeURIComponent(input.accessToken)}`

  const userData: Record<string, unknown> = {}
  if (input.userData.email) {
    userData.em = [hashSha256(normalizeEmail(input.userData.email))]
  }
  if (input.userData.phone) {
    userData.ph = [hashSha256(normalizePhone(input.userData.phone))]
  }
  if (input.userData.fbclid) {
    userData.fbc = composeFbc(input.userData.fbclid)
  }
  if (input.userData.fbp) {
    userData.fbp = input.userData.fbp
  }
  if (input.userData.clientIpAddress) {
    userData.client_ip_address = input.userData.clientIpAddress
  }
  if (input.userData.clientUserAgent) {
    userData.client_user_agent = input.userData.clientUserAgent
  }

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: input.eventName,
        event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        action_source: 'website',
        event_source_url: input.sourceUrl ?? undefined,
        user_data: userData,
        custom_data: input.customData ?? {},
      },
    ],
  }
  if (input.testEventCode) {
    body.test_event_code = input.testEventCode
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    return {
      status: res.status,
      body: text,
      succeeded: res.status >= 200 && res.status < 300,
    }
  } catch (err) {
    return {
      status: 0,
      body: String(err),
      succeeded: false,
    }
  }
}
