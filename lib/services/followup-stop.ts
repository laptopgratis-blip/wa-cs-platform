// Deteksi keyword STOP dari customer + efeknya (blacklist follow-up dan
// cancel queue). Diekstrak dari app/api/internal/followup-stop-check/route.ts
// supaya webhook Cloud API bisa memanggil tanpa HTTP.

import { prisma } from '@/lib/prisma'
import { cancelQueueForCustomer } from '@/lib/services/followup-engine'

// Keyword yang trigger stop. Match: case-insensitive, exact match atau
// keyword di awal pesan (mis. "STOP. tolong jangan ganggu lagi"). Tidak match
// di tengah pesan supaya "PRODUKNYA STOP DI JNE" tidak trigger.
const STOP_KEYWORDS = [
  'stop',
  'berhenti',
  'jangan kirim',
  'unsubscribe',
  'jangan ganggu',
  'hentikan',
] as const

export const STOP_AUTO_REPLY =
  'Baik kak, kami tidak akan kirim pesan otomatis lagi. Terima kasih 🙏'

export function detectStopKeyword(content: string): string | null {
  const text = content.toLowerCase().trim()
  if (!text) return null
  for (const kw of STOP_KEYWORDS) {
    if (text === kw) return kw
    if (text.startsWith(kw + ' ')) return kw
    if (text.startsWith(kw + '.')) return kw
    if (text.startsWith(kw + ',')) return kw
    if (text.startsWith(kw + '!')) return kw
  }
  return null
}

/**
 * Terapkan efek STOP: upsert blacklist + cancel pending queue. Best-effort —
 * kegagalan di-log, tidak dilempar (intent user tetap dihormati caller).
 */
export async function applyFollowupStop(input: {
  userId: string
  phoneNumber: string
  content: string
  matched: string
}): Promise<void> {
  // Normalisasi phone — format yang sama dengan saat queue dibuat.
  const customerPhone = input.phoneNumber.split('@')[0].replace(/^\+/, '')
  const reason = `Customer replied "${input.matched}": ${input.content.substring(0, 100)}`

  try {
    await prisma.followUpBlacklist.upsert({
      where: {
        userId_customerPhone: { userId: input.userId, customerPhone },
      },
      create: { userId: input.userId, customerPhone, reason },
      update: { reason },
    })

    await cancelQueueForCustomer(
      input.userId,
      customerPhone,
      `Stop keyword: ${input.matched}`,
    )
  } catch (err) {
    console.error('[followup-stop] gagal upsert blacklist:', err)
  }
}
