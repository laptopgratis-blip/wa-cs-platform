// GET   /api/ebooks/[id]/buyers — daftar pembeli (entitlement) e-book.
// PATCH /api/ebooks/[id]/buyers — aksi per entitlement:
//   REVOKE      → cabut akses (soft, bisa di-restore)
//   RESTORE     → aktifkan lagi akses REVOKED/EXPIRED
//   RESEND_LINK → kirim ulang link akses (reset klaim notif + kirim)
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { notifyEbookAccess } from '@/lib/services/ebook/access-notif'

export async function GET(
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
    const ebook = await prisma.ebook.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, title: true },
    })
    if (!ebook) return jsonError('E-book tidak ditemukan', 404)

    const entitlements = await prisma.ebookEntitlement.findMany({
      where: { ebookId: id },
      orderBy: { grantedAt: 'desc' },
      select: {
        id: true,
        buyerPhone: true,
        buyerName: true,
        buyerEmail: true,
        invoiceNumber: true,
        pricePaidRp: true,
        purchaseCount: true,
        totalPaidRp: true,
        status: true,
        grantedAt: true,
        expiresAt: true,
        revokedAt: true,
        revokeReason: true,
        downloadCount: true,
        maxDownloads: true,
        accessNotifiedAt: true,
        downloadLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true, createdAt: true },
        },
      },
    })

    return jsonOk({
      ebook,
      items: entitlements.map((e) => ({
        ...e,
        grantedAt: e.grantedAt.toISOString(),
        expiresAt: e.expiresAt?.toISOString() ?? null,
        revokedAt: e.revokedAt?.toISOString() ?? null,
        accessNotifiedAt: e.accessNotifiedAt?.toISOString() ?? null,
        lastDownload: e.downloadLogs[0]
          ? {
              status: e.downloadLogs[0].status,
              at: e.downloadLogs[0].createdAt.toISOString(),
            }
          : null,
        downloadLogs: undefined,
      })),
    })
  } catch (err) {
    console.error('[GET /api/ebooks/[id]/buyers] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
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
  const body = await req.json().catch(() => null)
  const entitlementId =
    typeof body?.entitlementId === 'string' ? body.entitlementId : null
  const action =
    body?.action === 'REVOKE' ||
    body?.action === 'RESTORE' ||
    body?.action === 'RESEND_LINK'
      ? (body.action as 'REVOKE' | 'RESTORE' | 'RESEND_LINK')
      : null
  if (!entitlementId || !action) {
    return jsonError('entitlementId & action wajib diisi', 400)
  }

  try {
    // Scope kepemilikan: entitlement harus milik e-book user ini.
    const ent = await prisma.ebookEntitlement.findFirst({
      where: { id: entitlementId, ebookId: id, ebook: { userId: session.user.id } },
      select: { id: true, status: true, expiresAt: true },
    })
    if (!ent) return jsonError('Data pembeli tidak ditemukan', 404)

    if (action === 'REVOKE') {
      await prisma.ebookEntitlement.update({
        where: { id: ent.id },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokeReason: 'Dicabut penjual',
        },
      })
      return jsonOk({ ok: true })
    }

    if (action === 'RESTORE') {
      // Restore dari REVOKED/EXPIRED. Kalau expiresAt sudah lampau, hapus
      // supaya tidak langsung expired lagi saat download (penjual sadar
      // me-restore = beri akses lagi).
      const clearExpiry =
        ent.expiresAt !== null && ent.expiresAt.getTime() < Date.now()
      await prisma.ebookEntitlement.update({
        where: { id: ent.id },
        data: {
          status: 'ACTIVE',
          revokedAt: null,
          revokeReason: null,
          ...(clearExpiry && { expiresAt: null }),
        },
      })
      return jsonOk({ ok: true })
    }

    // RESEND_LINK: reset klaim notif lalu kirim ulang (WA → email fallback).
    await prisma.ebookEntitlement.update({
      where: { id: ent.id },
      data: { accessNotifiedAt: null },
    })
    await notifyEbookAccess(ent.id)
    const after = await prisma.ebookEntitlement.findUnique({
      where: { id: ent.id },
      select: { accessNotifiedAt: true },
    })
    // accessNotifiedAt terisi = salah satu kanal berhasil.
    if (!after?.accessNotifiedAt) {
      return jsonError(
        'WA & email gagal — akan dicoba ulang otomatis dalam 24 jam',
        502,
      )
    }
    return jsonOk({ ok: true })
  } catch (err) {
    console.error('[PATCH /api/ebooks/[id]/buyers] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
