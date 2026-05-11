// GET  /api/integrations/pixels — list pixel integrations user.
// POST /api/integrations/pixels — buat integration baru. Encrypt accessToken
//                                  dengan AES-256-GCM (lib/crypto.ts).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { encrypt, maskKey } from '@/lib/crypto'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import {
  PIXEL_INTEGRATION_LIMIT_PER_USER,
  pixelIntegrationCreateSchema,
} from '@/lib/validations/pixel-integration'

// Saat list, JANGAN return accessToken plaintext. Kasih masked version
// supaya UI tetap bisa show "ada/tidak ada token" tanpa expose ke client.
function safePixelOutput(
  p: Awaited<ReturnType<typeof prisma.pixelIntegration.findFirst>>,
) {
  if (!p) return null
  return {
    ...p,
    accessToken: p.accessToken ? maskKey('decrypt-not-needed-for-mask') : null,
    accessTokenSet: !!p.accessToken,
    lastEventAt: p.lastEventAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

export async function GET() {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  try {
    const items = await prisma.pixelIntegration.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    })
    return jsonOk({
      items: items.map(safePixelOutput),
      limit: PIXEL_INTEGRATION_LIMIT_PER_USER,
      used: items.length,
    })
  } catch (err) {
    console.error('[GET /api/integrations/pixels] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const json = await req.json().catch(() => null)
  const parsed = pixelIntegrationCreateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  try {
    const count = await prisma.pixelIntegration.count({
      where: { userId: session.user.id },
    })
    if (count >= PIXEL_INTEGRATION_LIMIT_PER_USER) {
      return jsonError(
        `Sudah mencapai batas ${PIXEL_INTEGRATION_LIMIT_PER_USER} integrasi pixel.`,
        409,
      )
    }
    const data = parsed.data
    const created = await prisma.pixelIntegration.create({
      data: {
        userId: session.user.id,
        platform: data.platform,
        displayName: data.displayName,
        pixelId: data.pixelId.trim(),
        serverSideEnabled: data.serverSideEnabled,
        accessToken: data.accessToken ? encrypt(data.accessToken) : null,
        conversionLabelInitiateCheckout:
          data.conversionLabelInitiateCheckout ?? null,
        conversionLabelLead: data.conversionLabelLead ?? null,
        conversionLabelPurchase: data.conversionLabelPurchase ?? null,
        testEventCode: data.testEventCode ?? null,
        isTestMode: data.isTestMode,
        triggerOnBuyerProofUpload: data.triggerOnBuyerProofUpload,
        triggerOnAdminProofUpload: data.triggerOnAdminProofUpload,
        triggerOnAdminMarkPaid: data.triggerOnAdminMarkPaid,
        isActive: data.isActive,
      },
    })
    return jsonOk(safePixelOutput(created), 201)
  } catch (err) {
    console.error('[POST /api/integrations/pixels] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
