// PATCH  /api/integrations/pixels/[id] — edit. Untuk accessToken:
//   - undefined / not in body = pertahankan existing
//   - null = hapus token
//   - string non-empty = re-encrypt set baru
// DELETE /api/integrations/pixels/[id] — hapus integrasi.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { encrypt, maskKey } from '@/lib/crypto'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { pixelIntegrationUpdateSchema } from '@/lib/validations/pixel-integration'

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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const rawJson = await req.json().catch(() => null)
  if (!rawJson || typeof rawJson !== 'object') {
    return jsonError('Body invalid', 400)
  }
  // Snapshot key existence supaya bisa bedakan "not in body" vs "null".
  const tokenWasInBody = 'accessToken' in (rawJson as Record<string, unknown>)
  const parsed = pixelIntegrationUpdateSchema.safeParse(rawJson)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  try {
    const existing = await prisma.pixelIntegration.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) return jsonError('Integrasi tidak ditemukan', 404)

    const data = parsed.data

    // Compose accessToken update logic.
    let tokenUpdate: { accessToken: string | null } | object = {}
    if (tokenWasInBody) {
      if (data.accessToken == null) {
        tokenUpdate = { accessToken: null }
      } else if (data.accessToken.trim().length > 0) {
        tokenUpdate = { accessToken: encrypt(data.accessToken) }
      }
    }

    const updated = await prisma.pixelIntegration.update({
      where: { id },
      data: {
        ...(data.platform !== undefined && { platform: data.platform }),
        ...(data.displayName !== undefined && {
          displayName: data.displayName,
        }),
        ...(data.pixelId !== undefined && { pixelId: data.pixelId.trim() }),
        ...(data.serverSideEnabled !== undefined && {
          serverSideEnabled: data.serverSideEnabled,
        }),
        ...tokenUpdate,
        ...(data.conversionLabelInitiateCheckout !== undefined && {
          conversionLabelInitiateCheckout: data.conversionLabelInitiateCheckout,
        }),
        ...(data.conversionLabelLead !== undefined && {
          conversionLabelLead: data.conversionLabelLead,
        }),
        ...(data.conversionLabelPurchase !== undefined && {
          conversionLabelPurchase: data.conversionLabelPurchase,
        }),
        ...(data.testEventCode !== undefined && {
          testEventCode: data.testEventCode,
        }),
        ...(data.isTestMode !== undefined && { isTestMode: data.isTestMode }),
        ...(data.triggerOnBuyerProofUpload !== undefined && {
          triggerOnBuyerProofUpload: data.triggerOnBuyerProofUpload,
        }),
        ...(data.triggerOnAdminProofUpload !== undefined && {
          triggerOnAdminProofUpload: data.triggerOnAdminProofUpload,
        }),
        ...(data.triggerOnAdminMarkPaid !== undefined && {
          triggerOnAdminMarkPaid: data.triggerOnAdminMarkPaid,
        }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    })

    return jsonOk(safePixelOutput(updated))
  } catch (err) {
    console.error('[PATCH /api/integrations/pixels/[id]] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  try {
    const existing = await prisma.pixelIntegration.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) return jsonError('Integrasi tidak ditemukan', 404)
    await prisma.pixelIntegration.delete({ where: { id } })
    return jsonOk({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/integrations/pixels/[id]] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
