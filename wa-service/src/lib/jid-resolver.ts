// Resolve JID Baileys ke nomor telepon asli untuk dipakai sebagai phoneNumber
// kontak. Kasus utama yang ditangani:
//
// 1. JID format `<digit>@s.whatsapp.net` → ambil bagian sebelum `@`
// 2. JID format `<digit>:<deviceId>@s.whatsapp.net` → buang deviceId juga
// 3. JID format `<digit>@lid` (privacy mode WA) → coba resolve ke PN via
//    `signalRepository.lidMapping.getPNForLID()`. Mapping ini di-populate
//    Baileys sendiri saat decode pesan (lihat decode-wa-message.js). Fallback
//    ke `sock.onWhatsApp(jid)` kalau LID belum ada di store. Kalau semua gagal,
//    return JID asli sebagai fallback supaya tidak crash — log warning saja.
//
// Hasil resolve di-cache 1 jam dalam memory supaya tidak hammer Baileys.

import type { WASocket } from 'baileys'

interface CacheEntry {
  result: string
  expiresAt: number
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 jam
const cache = new Map<string, CacheEntry>()

// Hapus entry expired secara lazy supaya Map tidak tumbuh tanpa batas.
function getCached(key: string): string | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return hit.result
}

function setCached(key: string, result: string): void {
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS })
}

// Extract digit-only nomor dari JID seperti `628111@s.whatsapp.net` atau
// `628111:42@s.whatsapp.net`. Return null kalau bukan format PN.
function pnFromJid(jid: string): string | null {
  if (!jid.includes('@')) return null
  const beforeAt = jid.split('@')[0] ?? ''
  const beforeColon = beforeAt.split(':')[0] ?? beforeAt
  if (!/^\d+$/.test(beforeColon)) return null
  return beforeColon
}

export async function resolvePhoneNumber(
  sock: WASocket | null,
  jid: string,
): Promise<string> {
  if (!jid) return jid

  // PN langsung — tidak perlu lookup.
  if (jid.endsWith('@s.whatsapp.net')) {
    return pnFromJid(jid) ?? jid
  }

  // Bukan LID → return as-is (group, broadcast, dll. caller yang filter).
  if (!jid.endsWith('@lid')) {
    return pnFromJid(jid) ?? jid
  }

  // Cache lookup khusus LID.
  const cached = getCached(jid)
  if (cached) return cached

  // Coba resolve via signalRepository.lidMapping (Baileys 7.x). Kalau socket
  // tidak ada / Baileys belum support, fallback ke onWhatsApp.
  try {
    const repo = (sock as unknown as {
      signalRepository?: {
        lidMapping?: { getPNForLID?: (lid: string) => Promise<string | null> }
      }
    } | null)?.signalRepository
    const getPN = repo?.lidMapping?.getPNForLID
    if (getPN) {
      const pnJid = await getPN.call(repo!.lidMapping, jid)
      if (pnJid) {
        const pn = pnFromJid(pnJid)
        if (pn) {
          setCached(jid, pn)
          return pn
        }
      }
    }
  } catch (err) {
    console.warn(
      `[jid-resolver] getPNForLID gagal untuk ${jid}:`,
      (err as Error).message,
    )
  }

  // Fallback: tanya server WA langsung. Mungkin nomor user yang LID-nya kita
  // pegang sebenarnya kontaknya kita sendiri.
  try {
    const onWa = (sock as unknown as {
      onWhatsApp?: (
        ...phoneNumber: string[]
      ) => Promise<Array<{ jid: string; exists: boolean; lid?: string }>>
    } | null)?.onWhatsApp
    if (onWa) {
      const res = await onWa.call(sock!, jid)
      const first = Array.isArray(res) ? res[0] : null
      if (first?.exists && first.jid) {
        const pn = pnFromJid(first.jid)
        if (pn) {
          setCached(jid, pn)
          return pn
        }
      }
    }
  } catch (err) {
    console.warn(
      `[jid-resolver] onWhatsApp gagal untuk ${jid}:`,
      (err as Error).message,
    )
  }

  // Semua gagal — return LID asli, jangan crash. Cache juga supaya tidak
  // re-try terus pesan dari kontak yang sama.
  setCached(jid, jid)
  console.warn(`[jid-resolver] tidak bisa resolve LID ${jid}, fallback ke LID`)
  return jid
}

// Test/admin helper: paksa kosongkan cache (mis. setelah migration script
// jalan supaya request berikut re-resolve).
export function clearLidCache(): void {
  cache.clear()
}
