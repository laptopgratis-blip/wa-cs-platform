// Guard anti-SSRF untuk URL webhook milik seller.
//
// Ancaman: seller (atau penyerang yang membajak akunnya) memasang URL yang
// menunjuk ke jaringan internal — localhost, IP privat, metadata cloud
// (169.254.169.254) — lalu platform yang "menembak dirinya sendiri".
//
// Dua lapis pemakaian:
// 1. Saat CREATE/UPDATE: `assertSafeWebhookUrl` — umpan balik cepat ke user.
// 2. Saat SETIAP kirim: `guardedLookup` dipasang sebagai opsi `lookup`
//    https.request sehingga validasi terjadi pada alamat yang BENAR-BENAR
//    dipakai koneksi — menutup celah DNS rebinding (domain lolos saat create,
//    lalu record-nya diganti ke IP privat).
import { isIP } from 'net'
import dns from 'dns'

// Dev lokal butuh menembak listener 127.0.0.1 untuk uji end-to-end.
// JANGAN PERNAH menyetel env ini di produksi/staging. Dibaca saat panggil
// (bukan saat load modul) supaya bisa diuji & urutan loading env tak berpengaruh.
function allowPrivate(): boolean {
  return process.env.WEBHOOK_ALLOW_PRIVATE_URL === '1'
}

export class WebhookUrlError extends Error {}

function ipv4ToInt(ip: string): number {
  const [a, b, c, d] = ip.split('.').map(Number)
  return ((a << 24) >>> 0) + (b << 16) + (c << 8) + d
}

function inCidr4(ip: number, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (ip & mask) === (ipv4ToInt(base) & mask)
}

const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local + metadata cloud
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
]

function isPrivateV4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  return BLOCKED_V4.some(([base, bits]) => inCidr4(n, base, bits))
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase()
  // IPv4-mapped (::ffff:a.b.c.d) → nilai sebenarnya IPv4.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateV4(mapped[1])
  if (lower === '::' || lower === '::1') return true
  // fc00::/7 (ULA), fe80::/10 (link-local), 64:ff9b::/96 (NAT64 — bisa
  // membungkus IPv4 privat; tolak seluruhnya biar aman).
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (/^fe[89ab]/.test(lower)) return true
  if (lower.startsWith('64:ff9b:')) return true
  return false
}

export function isBlockedIp(ip: string): boolean {
  if (allowPrivate()) return false
  const kind = isIP(ip)
  if (kind === 4) return isPrivateV4(ip)
  if (kind === 6) return isPrivateV6(ip)
  return true // bukan IP valid → tolak
}

/**
 * Validasi URL webhook: bentuk, skema https, dan SEMUA alamat hasil resolve
 * bukan IP privat/internal. Throw WebhookUrlError dengan pesan siap-UI.
 */
export async function assertSafeWebhookUrl(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new WebhookUrlError('URL tidak valid.')
  }
  if (url.protocol !== 'https:' && !(allowPrivate() && url.protocol === 'http:')) {
    throw new WebhookUrlError('URL webhook wajib https://.')
  }
  if (url.username || url.password) {
    throw new WebhookUrlError('URL tidak boleh memuat kredensial (user:pass@).')
  }

  const host = url.hostname
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new WebhookUrlError('Alamat IP internal/privat tidak diizinkan.')
    return url
  }

  let addrs: dns.LookupAddress[]
  try {
    addrs = await dns.promises.lookup(host, { all: true, verbatim: true })
  } catch {
    throw new WebhookUrlError(`Domain ${host} tidak bisa di-resolve.`)
  }
  if (addrs.length === 0) throw new WebhookUrlError(`Domain ${host} tidak punya alamat.`)
  for (const a of addrs) {
    if (isBlockedIp(a.address)) {
      throw new WebhookUrlError('Domain menunjuk ke alamat internal/privat — tidak diizinkan.')
    }
  }
  return url
}

/**
 * Pengganti dns.lookup untuk https.request: alamat yang dipilih resolver
 * divalidasi TEPAT sebelum dipakai koneksi. Callback error → request gagal.
 */
export const guardedLookup: typeof dns.lookup = ((
  hostname: string,
  options: dns.LookupOptions | ((err: NodeJS.ErrnoException | null, address: string, family: number) => void),
  callback?: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
) => {
  const cb = (typeof options === 'function' ? options : callback) as (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number,
  ) => void
  const opts = (typeof options === 'function' ? {} : options) as dns.LookupOptions

  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err, '', 0)
    const list = addresses as dns.LookupAddress[]
    const blocked = list.find((a) => isBlockedIp(a.address))
    if (blocked || list.length === 0) {
      const e = Object.assign(new Error('alamat internal/privat ditolak (guard SSRF)'), {
        code: 'EBLOCKED',
      }) as NodeJS.ErrnoException
      return cb(e, '', 0)
    }
    if (opts.all) return cb(null, list)
    return cb(null, list[0].address, list[0].family)
  })
}) as typeof dns.lookup
