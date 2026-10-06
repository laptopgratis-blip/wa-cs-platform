// Notifikasi in-app (bell) ke seller saat follow-up gagal FINAL.
// Dedupe per (userId, type, link, title) 24 jam — link + judul mewakili
// lingkup penyebab (template tertentu / nomor pengirim / kredit), jadi satu
// template rusak yang membuat puluhan queue gagal cukup satu notifikasi, nomor
// terputus cukup satu notifikasi per user, dan gagal generik tidak menelan
// notifikasi template rusak yang nyata. Scope CUSTOMER tidak dinotifikasi.
// NEVER throw: dipanggil dari cron di tengah loop pengiriman.

import { prisma } from '@/lib/prisma'
import {
  buildFollowUpFailureNotification,
  type FollowUpFailureScope,
} from '@/lib/services/followup-failure-policy'
import { createNotification } from '@/lib/services/subscription'

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000

export interface FollowUpFailureAlertInput {
  userId: string
  followUpTemplateId: string
  templateName: string
  reason: string
  scope: FollowUpFailureScope
}

export async function notifyFollowUpFailure(input: FollowUpFailureAlertInput): Promise<boolean> {
  try {
    const notif = buildFollowUpFailureNotification(input)
    if (!notif) return false

    const recent = await prisma.subscriptionNotification.findFirst({
      where: {
        userId: input.userId,
        type: notif.type,
        link: notif.link,
        title: notif.title,
        createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
      },
      select: { id: true },
    })
    if (recent) return false

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
