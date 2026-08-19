// Update status pesan outbound dari webhook `statuses` Cloud API.
// Guard progresi: SENT → DELIVERED → READ hanya naik (webhook bisa datang
// out-of-order / dobel); FAILED hanya dari status non-READ.
// Trek 2B: rekonsiliasi Kredit Pesan dari `pricing` (sebelum early-return
// `sent`), opt-out 131050, dan progres BroadcastRecipient.

import type { MessageStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

import { markMarketingOptOut, reconcileFromStatus } from './billing-reconcile'
import { relayEmit } from './realtime'
import type { WabaChangeValue, WabaStatusUpdate } from './types'

// Status yang boleh ditimpa oleh status baru (rank lebih rendah saja).
const OVERWRITABLE: Record<string, MessageStatus[]> = {
  delivered: ['SENT'],
  read: ['SENT', 'DELIVERED'],
  // Pesan yang sudah READ tidak mungkin gagal — jangan diturunkan.
  failed: ['SENT', 'DELIVERED'],
}

const TARGET: Record<string, MessageStatus> = {
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
}

// Customer memilih berhenti menerima pesan marketing.
const MARKETING_OPT_OUT_ERROR = 131050

export async function handleStatuses(
  phoneNumberId: string,
  value: WabaChangeValue,
): Promise<void> {
  const session = await prisma.whatsappSession.findUnique({
    where: { phoneNumberId },
    select: { id: true, userId: true },
  })
  if (!session) return

  for (const status of value.statuses ?? []) {
    try {
      await processOne(session, status)
    } catch (err) {
      console.error(`[waba/statuses] gagal proses wamid=${status.id}:`, err)
    }
  }
}

async function processOne(
  session: { id: string; userId: string },
  status: WabaStatusUpdate,
): Promise<void> {
  const kind = status.status ?? ''

  // Rekonsiliasi biaya DULU — `pricing` biasanya ikut di event `sent`.
  try {
    await reconcileFromStatus(status)
  } catch (err) {
    console.error(`[waba/statuses] rekonsiliasi kredit wamid=${status.id} gagal:`, err)
  }

  // 'sent' = status awal saat create Message — tidak ada transisi yang perlu.
  if (kind === 'sent' || !TARGET[kind]) return

  const updated = await prisma.message.updateMany({
    where: { externalMsgId: status.id, status: { in: OVERWRITABLE[kind] } },
    data: { status: TARGET[kind] },
  })

  const errInfo = status.errors?.[0]
  if (kind === 'failed') {
    console.error(
      `[waba/statuses] pesan gagal wamid=${status.id} code=${errInfo?.code ?? '-'} ${errInfo?.title ?? ''} ${errInfo?.error_data?.details ?? ''}`,
    )
    if (errInfo?.code === MARKETING_OPT_OUT_ERROR && status.recipient_id) {
      await markMarketingOptOut({
        userId: session.userId,
        phone: status.recipient_id,
        source: 'META_ERROR_131050',
        optOut: true,
        detail: errInfo.error_data?.details ?? errInfo.title ?? null,
      }).catch((err) => console.error('[waba/statuses] opt-out 131050 gagal:', err))
    }
    if (updated.count > 0) {
      // Payload FAILED-only — kontrak existing frontend (InboxStatusPayload).
      void relayEmit('inbox:status', {
        sessionId: session.id,
        externalMsgId: status.id,
        status: 'FAILED',
      })
    }
  }

  // Progres BroadcastRecipient (delivered/read/failed) — diisi WI-6
  // (lib/services/broadcast/recipient-status.ts) setelah Migrasi 2.
}
