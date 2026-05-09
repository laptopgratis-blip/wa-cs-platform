// POST /api/lp/[lpId]/versions/[versionId]/restore
// Restore HTML LP dari versi yang dipilih. Snapshot HTML current dulu (source=restore)
// supaya restore-of-restore tetap bisa rollback.
//
// Tidak charge token (operasi metadata only, no AI call).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { snapshotVersion } from '@/lib/services/lp-optimize'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ lpId: string; versionId: string }>
}

export async function POST(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { lpId, versionId } = await params

  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: { id: true, userId: true, htmlContent: true },
  })
  if (!lp) return jsonError('LP tidak ditemukan', 404)
  if (lp.userId !== session.user.id) return jsonError('Forbidden', 403)

  const version = await prisma.lpVersion.findUnique({
    where: { id: versionId },
    select: { id: true, lpId: true, htmlContent: true, source: true, scoreSnapshot: true },
  })
  if (!version) return jsonError('Versi tidak ditemukan', 404)
  if (version.lpId !== lpId) return jsonError('Versi mismatch dgn LP', 400)

  try {
    // Snapshot current state dulu sebelum overwrite.
    const snapshotId = await snapshotVersion({
      lpId,
      htmlContent: lp.htmlContent,
      source: 'restore',
      scoreSnapshot: null,
      note: `Pre-restore snapshot — sebelum revert ke versi ${versionId.slice(0, 8)}`,
    })
    // Replace dengan HTML versi target.
    await prisma.landingPage.update({
      where: { id: lpId },
      data: { htmlContent: version.htmlContent },
    })

    return jsonOk({
      restoredFromVersionId: versionId,
      backupSnapshotId: snapshotId,
      message: 'HTML LP sudah di-restore. Backup state sebelumnya tersimpan di Riwayat.',
    })
  } catch (err) {
    console.error('[POST /api/lp/:id/versions/:vid/restore] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
