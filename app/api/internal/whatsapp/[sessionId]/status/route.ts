// POST /api/internal/whatsapp/[sessionId]/status
// Body: { status: WaStatus, phoneNumber?: string, displayName?: string }
//
// Dipanggil wa-service setiap kali state internal session berubah —
// supaya status di DB selalu sync dengan state runtime.
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  status: z.enum([
    'DISCONNECTED',
    'CONNECTING',
    'WAITING_QR',
    'CONNECTED',
    'PAUSED',
    'ERROR',
  ]),
  phoneNumber: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
})

interface Params {
  params: Promise<{ sessionId: string }>
}

export async function POST(req: Request, { params }: Params) {
  const blocked = requireServiceSecret(req)
  if (blocked) return blocked

  const { sessionId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'invalid body' },
      { status: 400 },
    )
  }

  try {
    const updated = await prisma.whatsappSession.update({
      where: { id: sessionId },
      data: {
        status: parsed.data.status,
        // phoneNumber/displayName cuma di-set kalau dikirim & non-empty;
        // jangan overwrite ke null.
        ...(parsed.data.phoneNumber
          ? { phoneNumber: parsed.data.phoneNumber }
          : {}),
        ...(parsed.data.displayName
          ? { displayName: parsed.data.displayName }
          : {}),
      },
      select: { id: true, status: true, phoneNumber: true, displayName: true },
    })
    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    console.error('[POST /api/internal/whatsapp/:id/status] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
