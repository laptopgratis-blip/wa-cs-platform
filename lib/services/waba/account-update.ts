// Webhook `account_update` (level WABA). Yang relevan untuk sesi:
//   PARTNER_REMOVED  — user memutus akses hulao (mis. dari WA Business App
//                      di HP pada mode coexistence, atau Business Settings)
//   DISABLED_UPDATE  — WABA dinonaktifkan Meta
// Sesi hulao ditandai ERROR + alasan supaya UI tidak menampilkan "Terhubung"
// palsu. Catatan: field ini TIDAK bisa di-override per-WABA — hanya sampai
// bila callback level-App Meta App menunjuk ke hulao.

import { prisma } from '@/lib/prisma'
import type { WabaChangeValue } from './types'

const EVENT_MESSAGES: Record<string, string> = {
  PARTNER_REMOVED: 'Akses hulao dicabut dari WhatsApp Business Account (partner removed) — hubungkan ulang',
  DISABLED_UPDATE: 'WhatsApp Business Account dinonaktifkan oleh Meta',
  ACCOUNT_RESTRICTION: 'WhatsApp Business Account dibatasi Meta — cek WhatsApp Manager',
}

export async function handleAccountUpdate(wabaId: string, value: WabaChangeValue): Promise<void> {
  const event = (value as { event?: string }).event
  if (!event) return
  const message = EVENT_MESSAGES[event]
  console.log(`[waba/account-update] WABA ${wabaId} event=${event}${message ? '' : ' (diabaikan)'}`)
  if (!message) return

  await prisma.whatsappSession.updateMany({
    where: { wabaId, provider: 'CLOUD_API', isActive: true, status: { not: 'DISCONNECTED' } },
    data: { status: 'ERROR', lastError: message },
  })
}
