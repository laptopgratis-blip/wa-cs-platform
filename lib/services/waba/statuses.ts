// Update status pesan outbound dari webhook `statuses` Cloud API.
// Guard progresi: SENT → DELIVERED → READ hanya naik (webhook bisa datang
// out-of-order / dobel); FAILED hanya dari status non-READ.

import type { MessageStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

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

export async function handleStatuses(
  phoneNumberId: string,
  value: WabaChangeValue,
): Promise<void> {
  const session = await prisma.whatsappSession.findUnique({
    where: { phoneNumberId },
    select: { id: true },
  })
  if (!session) return

  for (const status of value.statuses ?? []) {
    try {
      await processOne(session.id, status)
    } catch (err) {
      console.error(`[waba/statuses] gagal proses wamid=${status.id}:`, err)
    }
  }
}

async function processOne(sessionId: string, status: WabaStatusUpdate): Promise<void> {
  const kind = status.status ?? ''
  // 'sent' = status awal saat create Message — tidak ada transisi yang perlu.
  if (kind === 'sent' || !TARGET[kind]) return

  const updated = await prisma.message.updateMany({
    where: { externalMsgId: status.id, status: { in: OVERWRITABLE[kind] } },
    data: { status: TARGET[kind] },
  })

  if (kind === 'failed') {
    const errInfo = status.errors?.[0]
    console.error(
      `[waba/statuses] pesan gagal wamid=${status.id} code=${errInfo?.code ?? '-'} ${errInfo?.title ?? ''} ${errInfo?.error_data?.details ?? ''}`,
    )
    if (updated.count > 0) {
      // Payload FAILED-only — kontrak existing frontend (InboxStatusPayload).
      void relayEmit('inbox:status', {
        sessionId,
        externalMsgId: status.id,
        status: 'FAILED',
      })
    }
  }
}
