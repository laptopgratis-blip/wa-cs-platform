// Lapisan Tangkap — helper untuk session/event/lead. Append-only logging.
// Pattern: fungsi murni yg di-call dari handler API tanpa side-effect tersembunyi.
//
// Idempotent: ensureSession aman dipanggil tiap chat (upsert by clientSessionId).
import { createHash } from 'node:crypto'

import type { LiveEventType } from '@prisma/client'

import { prisma } from '@/lib/prisma'

// Buat hash fingerprint dari IP + UA — bukan PII, untuk dedup analytics.
export function makeFingerprint(input: { ip: string; ua: string | null }): string {
  return createHash('sha256')
    .update(`${input.ip}|${input.ua ?? ''}`)
    .digest('hex')
    .slice(0, 32)
}

// Pastikan ada LiveSession untuk clientSessionId. Kalau belum ada, create +
// log SESSION_START event. Return id session.
export async function ensureLiveSession(input: {
  clientSessionId: string
  liveRoomId: string
  userId: string
  fingerprint?: string
  customerName?: string | null
  customerPhone?: string | null
}): Promise<{
  id: string
  isNew: boolean
  customerName: string | null
}> {
  const existing = await prisma.liveSession.findUnique({
    where: { clientSessionId: input.clientSessionId },
    select: { id: true, liveRoomId: true, customerName: true },
  })
  if (existing) {
    if (existing.liveRoomId !== input.liveRoomId) {
      throw new Error('Session ID milik room lain')
    }
    // Update name/phone kalau yang baru tersedia & belum di-set.
    if (input.customerName && !existing.customerName) {
      const updated = await prisma.liveSession.update({
        where: { id: existing.id },
        data: {
          customerName: input.customerName,
          customerPhone: input.customerPhone ?? null,
        },
        select: { customerName: true },
      })
      return { id: existing.id, isNew: false, customerName: updated.customerName }
    }
    return {
      id: existing.id,
      isNew: false,
      customerName: existing.customerName,
    }
  }
  const created = await prisma.liveSession.create({
    data: {
      clientSessionId: input.clientSessionId,
      liveRoomId: input.liveRoomId,
      userId: input.userId,
      fingerprint: input.fingerprint ?? null,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
    },
    select: { id: true, customerName: true },
  })
  await prisma.liveEvent.create({
    data: {
      liveSessionId: created.id,
      type: 'SESSION_START',
      payload: {
        fingerprint: input.fingerprint ?? null,
        customerName: input.customerName ?? null,
      },
    },
  })
  return { id: created.id, isNew: true, customerName: created.customerName }
}

export async function logLiveEvent(input: {
  liveSessionId: string
  type: LiveEventType
  payload?: Record<string, unknown>
}): Promise<void> {
  await prisma.liveEvent.create({
    data: {
      liveSessionId: input.liveSessionId,
      type: input.type,
      payload: (input.payload as object | null | undefined) ?? null,
    },
  })
}

// Atomic increment messageCount + update lastActivity. Dipanggil sehabis
// user/AI message tercatat.
export async function bumpMessageCount(liveSessionId: string): Promise<void> {
  await prisma.liveSession.update({
    where: { id: liveSessionId },
    data: { messageCount: { increment: 1 } },
  })
}

export async function bumpProductClicks(liveSessionId: string): Promise<void> {
  await prisma.liveSession.update({
    where: { id: liveSessionId },
    data: { productClicks: { increment: 1 } },
  })
}

// Get transkrip percakapan sebagai string panjang — untuk disimpan ke
// LiveLead.transcript saat handoff.
export async function buildTranscript(liveSessionId: string): Promise<string> {
  const events = await prisma.liveEvent.findMany({
    where: {
      liveSessionId,
      type: { in: ['USER_MESSAGE', 'AI_MESSAGE'] },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: { type: true, payload: true, createdAt: true },
  })
  const lines = events.map((e) => {
    const role = e.type === 'USER_MESSAGE' ? 'Customer' : 'AI'
    const text =
      (e.payload as { text?: string } | null)?.text?.toString().trim() ?? ''
    return `${role}: ${text}`
  })
  return lines.join('\n')
}
