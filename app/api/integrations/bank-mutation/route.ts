// Bank Mutation Auto-Reader — config endpoint (Phase 1 BETA, 2026-05-08).
//
// GET    /api/integrations/bank-mutation       — return integration user (atau null)
// POST   /api/integrations/bank-mutation       — buat / update kredensial BCA
// PATCH  /api/integrations/bank-mutation       — toggle setting (autoConfirm, dll)
// DELETE /api/integrations/bank-mutation       — disconnect & hapus history mutasi
//
// Plan gating: paket POWER only (requireOrderSystemAccess).
// Encrypt User ID + PIN dengan AES-256-GCM (lib/crypto.ts) sebelum simpan.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { encrypt } from '@/lib/crypto'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import {
  bankMutationSettingsSchema,
  bankMutationSetupSchema,
} from '@/lib/validations/bank-mutation'

// Output untuk client — JANGAN expose plaintext credentials atau cookie.
// hasCredentials = true berarti user sudah pernah simpan kredensial.
function safeOutput(
  i: Awaited<ReturnType<typeof prisma.bankMutationIntegration.findUnique>>,
) {
  if (!i) return null
  return {
    id: i.id,
    bankCode: i.bankCode,
    accountNumber: i.accountNumber,
    accountName: i.accountName,
    accountBalance: i.accountBalance,
    isActive: i.isActive,
    isBetaConsented: i.isBetaConsented,
    isAdminBlocked: i.isAdminBlocked,
    autoConfirmEnabled: i.autoConfirmEnabled,
    matchByExactAmount: i.matchByExactAmount,
    matchByCustomerName: i.matchByCustomerName,
    scrapeIntervalMinutes: i.scrapeIntervalMinutes,
    lastScrapedAt: i.lastScrapedAt?.toISOString() ?? null,
    lastScrapeStatus: i.lastScrapeStatus,
    lastScrapeError: i.lastScrapeError,
    totalMutationsCaptured: i.totalMutationsCaptured,
    totalAutoConfirmed: i.totalAutoConfirmed,
    totalScrapes: i.totalScrapes,
    totalScrapeFailures: i.totalScrapeFailures,
    hasCredentials: !!i.bcaUserId && !!i.bcaPin,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
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
    const integration = await prisma.bankMutationIntegration.findUnique({
      where: { userId: session.user.id },
    })
    return jsonOk({ integration: safeOutput(integration) })
  } catch (err) {
    console.error('[GET /api/integrations/bank-mutation]', err)
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
  const parsed = bankMutationSetupSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    const data = parsed.data
    const encryptedUser = encrypt(data.bcaUserId.trim())
    const encryptedPin = encrypt(data.bcaPin)

    const upserted = await prisma.bankMutationIntegration.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        bankCode: 'BCA',
        bcaUserId: encryptedUser,
        bcaPin: encryptedPin,
        isBetaConsented: data.isBetaConsented,
        isActive: true,
      },
      update: {
        bcaUserId: encryptedUser,
        bcaPin: encryptedPin,
        isBetaConsented: data.isBetaConsented,
        isActive: true,
        // Reset state: kredensial baru → invalidate session lama + reset error.
        cookieData: null,
        sessionExpiresAt: null,
        lastScrapeStatus: null,
        lastScrapeError: null,
      },
    })

    return jsonOk(safeOutput(upserted), 201)
  } catch (err) {
    console.error('[POST /api/integrations/bank-mutation]', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function PATCH(req: Request) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }

  const json = await req.json().catch(() => null)
  const parsed = bankMutationSettingsSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    const existing = await prisma.bankMutationIntegration.findUnique({
      where: { userId: session.user.id },
    })
    if (!existing) {
      return jsonError('Integration belum di-setup', 404)
    }

    const updated = await prisma.bankMutationIntegration.update({
      where: { userId: session.user.id },
      data: parsed.data,
    })
    return jsonOk(safeOutput(updated))
  } catch (err) {
    console.error('[PATCH /api/integrations/bank-mutation]', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE() {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  try {
    // Cascade akan hapus mutations + scrapeJobs (lihat schema onDelete: Cascade).
    await prisma.bankMutationIntegration
      .delete({ where: { userId: session.user.id } })
      .catch(() => null)
    return jsonOk({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/integrations/bank-mutation]', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
