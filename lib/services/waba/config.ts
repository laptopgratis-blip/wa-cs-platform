// Konfigurasi Meta App untuk WhatsApp Cloud API — env-only (bukan database).
// Semua nilai berasal dari Meta Developer Dashboard aplikasi Tech Provider.

import dns from 'node:dns'

// Graph API sering ETIMEDOUT di beberapa VPS saat resolve IPv6 duluan —
// paksa urutan IPv4 (pola yang sama dipakai kirimchat dengan sengaja).
dns.setDefaultResultOrder('ipv4first')

export interface MetaConfig {
  appId: string
  appSecret: string
  verifyToken: string
  configId: string
  graphVersion: string
  /** Base URL Graph API, contoh: https://graph.facebook.com/v23.0 */
  graphBaseUrl: string
  /** Endpoint webhook publik instance ini (dipakai override per-WABA). */
  webhookUrl: string
}

/**
 * Baca konfigurasi Meta dari env. Throw kalau variabel wajib kosong —
 * caller yang tidak boleh crash (mis. webhook receiver) bungkus try/catch.
 */
export function getMetaConfig(): MetaConfig {
  const appId = process.env.META_APP_ID || ''
  const appSecret = process.env.META_APP_SECRET || ''
  const verifyToken = process.env.META_VERIFY_TOKEN || ''
  const configId = process.env.META_CONFIG_ID || ''
  const graphVersion = process.env.META_GRAPH_VERSION || 'v23.0'
  const appUrl = process.env.NEXTAUTH_URL || ''

  const missing = [
    ['META_APP_ID', appId],
    ['META_APP_SECRET', appSecret],
    ['META_VERIFY_TOKEN', verifyToken],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length > 0) {
    throw new Error(`Konfigurasi Meta belum lengkap: ${missing.join(', ')} kosong`)
  }

  return {
    appId,
    appSecret,
    verifyToken,
    // configId hanya wajib untuk Embedded Signup — divalidasi di pemakainya.
    configId,
    graphVersion,
    graphBaseUrl: `https://graph.facebook.com/${graphVersion}`,
    webhookUrl: `${appUrl.replace(/\/$/, '')}/api/webhooks/meta`,
  }
}
