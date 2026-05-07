// Google Ads server-side conversion via GA4 Measurement Protocol.
// Endpoint: https://www.google-analytics.com/mp/collect?measurement_id=...&api_secret=...
// Docs: https://developers.google.com/analytics/devguides/collection/protocol/ga4
//
// CATATAN: Google Ads CAPI penuh butuh setup di Google Tag Manager Server
// Container atau pakai Conversions API (lebih kompleks, butuh OAuth dan
// account-level credential). Untuk Phase 3 implementasi awal, kita pakai
// jalur GA4 Measurement Protocol yang lebih straightforward — gclid akan
// di-pass sebagai parameter custom + transaction_id untuk dedup browser.
//
// Untuk full Google Ads conversion API (offline conversion, enhanced
// conversion, dll), upgrade nanti saat user butuh.

const GA4_MP_BASE = 'https://www.google-analytics.com/mp/collect'

export interface GoogleAdsUserData {
  email?: string | null
  phone?: string | null
  gclid?: string | null
}

export interface GoogleAdsEventInput {
  // Untuk GA4 MP: measurementId = G-XXXXXXXXXX. Tapi schema kita simpan
  // pixelId raw — bisa AW-* (Google Ads) atau G-* (GA4). Kalau AW-*, kita
  // tidak bisa pakai MP — return informational error.
  measurementId: string
  apiSecret: string
  // Conversion label spesifik (kalau platform GOOGLE_ADS) — dipakai untuk
  // build event_name format Google Ads compatible. Optional.
  conversionLabel?: string | null
  eventName: string
  eventId: string
  clientId?: string  // GA4 client_id, fallback random
  userData: GoogleAdsUserData
  value?: number
  currency?: string
  items?: Array<{
    item_id: string
    item_name?: string
    quantity?: number
    price?: number
  }>
}

export interface GoogleAdsResponse {
  status: number
  body: string
  succeeded: boolean
}

export async function sendGoogleAdsEvent(
  input: GoogleAdsEventInput,
): Promise<GoogleAdsResponse> {
  // Validasi measurement ID — harus G-* untuk GA4 Measurement Protocol.
  // AW-* (Google Ads) tidak compatible dengan endpoint ini → return error
  // informational supaya user paham.
  if (!input.measurementId.startsWith('G-')) {
    return {
      status: 0,
      body: `Google Ads (${input.measurementId}) butuh setup khusus via GTM Server atau Conversions API. Phase 3 ini cuma support GA4 (G-*) via Measurement Protocol. Browser pixel tetap jalan.`,
      succeeded: false,
    }
  }

  const url = `${GA4_MP_BASE}?measurement_id=${encodeURIComponent(
    input.measurementId,
  )}&api_secret=${encodeURIComponent(input.apiSecret)}`

  // GA4 MP butuh client_id yang stabil per visitor. Idealnya match dengan
  // _ga cookie di browser, tapi kalau tidak ada, generate random.
  const clientId =
    input.clientId ?? `${Math.random().toString(36).slice(2)}.${Date.now()}`

  // Map event Hulao → GA4 standard event names + parameters.
  const eventName = mapToGa4Event(input.eventName)

  const params: Record<string, unknown> = {
    transaction_id: input.eventId,
    currency: input.currency ?? 'IDR',
    value: input.value ?? 0,
  }
  if (input.items && input.items.length > 0) {
    params.items = input.items
  }
  if (input.userData.gclid) {
    // GCLID di-pass sebagai event param + di-pakai Google Ads untuk match
    // konversi ke campaign yang generate click.
    params.gclid = input.userData.gclid
  }
  if (input.conversionLabel) {
    params.conversion_label = input.conversionLabel
  }

  const body = {
    client_id: clientId,
    events: [{ name: eventName, params }],
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    // GA4 MP biasanya return 204 No Content tanpa body untuk success.
    const text = await res.text().catch(() => '')
    return {
      status: res.status,
      body: text || `(empty ${res.status})`,
      succeeded: res.status >= 200 && res.status < 300,
    }
  } catch (err) {
    return { status: 0, body: String(err), succeeded: false }
  }
}

// GA4 punya recommended event names yang mismatched dengan Meta. Map ke
// nama yang dimengerti GA4 supaya muncul di reports otomatis.
function mapToGa4Event(eventName: string): string {
  const map: Record<string, string> = {
    Purchase: 'purchase',
    Lead: 'generate_lead',
    AddToCart: 'add_to_cart',
    AddPaymentInfo: 'add_payment_info',
    InitiateCheckout: 'begin_checkout',
    ViewContent: 'view_item',
    PageView: 'page_view',
  }
  return map[eventName] ?? eventName.toLowerCase()
}
