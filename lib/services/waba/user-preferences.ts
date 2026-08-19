// Webhook `user_preferences`: customer memilih stop/resume pesan marketing
// dari dalam WhatsApp. Hanya menyentuh Contact.marketingOptOut* (+ log) —
// bukan isBlacklisted (CS/utility tetap boleh).

import { prisma } from '@/lib/prisma'

import { markMarketingOptOut } from './billing-reconcile'
import type { WabaUserPreferencesValue } from './types'

export async function handleUserPreferences(value: WabaUserPreferencesValue): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id
  if (!phoneNumberId) return
  const session = await prisma.whatsappSession.findUnique({
    where: { phoneNumberId },
    select: { userId: true },
  })
  if (!session) return

  for (const item of value.user_preferences ?? []) {
    try {
      if ((item.category ?? '') !== 'marketing_messages' || !item.wa_id) continue
      const optOut = (item.value ?? '').toLowerCase() === 'stop'
      const ts = item.timestamp ? new Date(Number(item.timestamp) * 1000) : null
      const n = await markMarketingOptOut({
        userId: session.userId,
        phone: item.wa_id,
        source: 'META_USER_PREFERENCE',
        optOut,
        detail: item.detail ?? null,
        metaTimestamp: ts && !Number.isNaN(ts.getTime()) ? ts : null,
      })
      console.log(`[waba/user-preferences] ${item.wa_id} marketing ${optOut ? 'STOP' : 'RESUME'} → ${n} kontak`)
    } catch (err) {
      console.error('[waba/user-preferences] gagal proses item:', err)
    }
  }
}
