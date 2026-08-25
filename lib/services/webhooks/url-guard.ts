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
  ['192.0.2.0', 24], // TEST-NET-1 (dokumentasi)
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved/Class E (termasuk 255.255.255.255 broadcast)
]

function isPrivateV4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  return BLOCKED_V4.some(([base, bits]) => inCidr4(n, base, bits))
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase()

  // Bentuk yang membungkus IPv4 → nilai sebenarnya IPv4.
  // ::ffff:a.b.c.d (mapped, dotted) & ::a.b.c.d (compatible, deprecated).
  const dotted = lower.match(/^::(ffff:)?(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) return isPrivateV4(dotted[2])
  // ::ffff:xxxx:xxxx (mapped, hex) — decode 2 grup hex jadi 4 oktet.
  const hexMapped = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16)
    const lo = parseInt(hexMapped[2], 16)
    return isPrivateV4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`)
  }

  // DEFAULT-DENY: satu-satunya rentang yang diizinkan adalah global unicast
  // 2000::/3 (nibble pertama 2 atau 3). Semua sisanya ditolak — ini menutup
  // loopback (::,::1), ULA (fc/fd), link-local (fe8-feb), multicast (ff),
  // NAT64 (64:ff9b), tanpa perlu mendaftar satu per satu.
  const first = lower.replace(/^\[|\]$/g, '')[0]
  if (first !== '2' && first !== '3') return true

  // Di dalam 2000::/3 pun, tolak rentang non-routable/tunneling yang bisa
  // membungkus alamat internal: 6to4 (2002::/16), Teredo (2001:0::/32),
  // dokumentasi (2001:db8::/32).
  if (lower.startsWith('2002:')) return true
  if (lower.startsWith('2001:db8:')) return true
  if (lower === '2001:0:0:0:0:0:0:0' || /^2001:0?:/.test(lower)) return true

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
  if (
    url.protocol !== 'https:' &&
    !(allowPrivate() && url.protocol === 'http:')
  ) {
    throw new WebhookUrlError('URL webhook wajib https://.')
  }
  if (url.username || url.password) {
    throw new WebhookUrlError('URL tidak boleh memuat kredensial (user:pass@).')
  }

  // WHATWG menyimpan host IPv6 literal DENGAN kurung siku ("[::1]") → isIP
  // selalu 0. Strip dulu supaya isBlockedIp benar-benar mengevaluasi alamatnya
  // (bukan "aman karena kebetulan gagal resolve").
  const host = url.hostname
  const bareHost =
    host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  if (isIP(bareHost)) {
    if (isBlockedIp(bareHost))
      throw new WebhookUrlError('Alamat IP internal/privat tidak diizinkan.')
    return url
  }

  let addrs: dns.LookupAddress[]
  try {
    addrs = await dns.promises.lookup(host, { all: true, verbatim: true })
  } catch {
    throw new WebhookUrlError(`Domain ${host} tidak bisa di-resolve.`)
  }
  if (addrs.length === 0)
    throw new WebhookUrlError(`Domain ${host} tidak punya alamat.`)
  for (const a of addrs) {
    if (isBlockedIp(a.address)) {
      throw new WebhookUrlError(
        'Domain menunjuk ke alamat internal/privat — tidak diizinkan.',
      )
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
  options:
    | dns.LookupOptions
    | ((
        err: NodeJS.ErrnoException | null,
        address: string,
        family: number,
      ) => void),
  callback?: (
    err: NodeJS.ErrnoException | null,
    address: string,
    family: number,
  ) => void,
) => {
  const cb = (typeof options === 'function' ? options : callback) as (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number,
  ) => void
  const opts = (
    typeof options === 'function' ? {} : options
  ) as dns.LookupOptions

  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err, '', 0)
    const list = addresses as dns.LookupAddress[]
    const blocked = list.find((a) => isBlockedIp(a.address))
    if (blocked || list.length === 0) {
      const e = Object.assign(
        new Error('alamat internal/privat ditolak (guard SSRF)'),
        {
          code: 'EBLOCKED',
        },
      ) as NodeJS.ErrnoException
      return cb(e, '', 0)
    }
    if (opts.all) return cb(null, list)
    return cb(null, list[0].address, list[0].family)
  })
}) as typeof dns.lookup
