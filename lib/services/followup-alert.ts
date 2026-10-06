// Notifikasi in-app (bell) ke seller saat follow-up gagal FINAL.
// Dedupe per (userId, type, link) 24 jam — satu template rusak yang membuat
// puluhan queue gagal cukup satu notifikasi. NEVER throw: dipanggil dari
// cron di tengah loop pengiriman.

import { prisma } from '@/lib/prisma'
import {
  buildFollowUpFailureNotification,
  FOLLOWUP_FAILURE_NOTIF_TYPE,
  followUpTemplateLink,
} from '@/lib/services/followup-failure-policy'
import { createNotification } from '@/lib/services/subscription'

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000

export interface FollowUpFailureAlertInput {
  userId: string
  followUpTemplateId: string
  templateName: string
  reason: string
}

export async function notifyFollowUpFailure(input: FollowUpFailureAlertInput): Promise<boolean> {
  try {
    const link = followUpTemplateLink(input.followUpTemplateId)
    const recent = await prisma.subscriptionNotification.findFirst({
      where: {
        userId: input.userId,
        type: FOLLOWUP_FAILURE_NOTIF_TYPE,
        link,
        createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
      },
      select: { id: true },
    })
    if (recent) return false

    const notif = buildFollowUpFailureNotification(input)
    await createNotification({
      userId: input.userId,
      type: notif.type,
      channel: 'IN_APP',
      title: notif.title,
      message: notif.message,
      link: notif.link,
    })
    return true
  } catch (err) {
    console.error('[followup-alert] gagal membuat notifikasi:', input.followUpTemplateId, err)
    return false
  }
}
