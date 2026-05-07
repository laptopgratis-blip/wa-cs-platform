// POST /api/cron/cleanup-lp — daily cron untuk cleanup LP-related data.
//
// Auth: header `x-cron-secret` harus match `process.env.CRON_SECRET`.
// Dipanggil dari cron eksternal (cron-job.org) atau cron host lokal sehari sekali.
//
// Yang dibersihkan:
//   1. LpVisit > 90 hari — analytics historical, tidak butuh data setua itu.
//      Hemat space DB + speed up monthly count query.
//   2. Orphan LpImage: file yg URL-nya TIDAK di-reference di htmlContent LP
//      manapun milik user (kecuali yg masih draft baru, < 7 hari — kasih
//      grace period supaya user tidak kehilangan upload yg belum sempat
//      dipasang). File dihapus dari disk + record dihapus.
//      Storage usage user di-decrement.
//
// Idempotent — aman dipanggil berkali-kali. Log per-iteration.
import { unlink } from 'node:fs/promises'
import path from 'node:path'

import { NextResponse } from 'next/server'

import { updateStorageUsed } from '@/lib/lp-quota'
import { prisma } from '@/lib/prisma'

const VISIT_RETAIN_DAYS = 90
const ORPHAN_GRACE_DAYS = 7

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }

  const stats = {
    visitsDeleted: 0,
    orphanFilesDeleted: 0,
    orphanRecordsDeleted: 0,
    storageReleasedMB: 0,
    errors: [] as string[],
  }

  try {
    // 1. Cleanup LpVisit > VISIT_RETAIN_DAYS hari.
    const visitCutoff = new Date(
      Date.now() - VISIT_RETAIN_DAYS * 24 * 60 * 60 * 1000,
    )
    const visitDelete = await prisma.lpVisit.deleteMany({
      where: { createdAt: { lt: visitCutoff } },
    })
    stats.visitsDeleted = visitDelete.count

    // 2. Cari orphan LpImage. Strategi:
    //    a. Ambil semua LpImage > grace period.
    //    b. Group by user → ambil htmlContent semua LP user itu sekali (avoid N+1).
    //    c. Untuk tiap image, cek apakah URL muncul di htmlContent LP manapun.
    //       Kalau tidak, dan lpId-nya tidak menunjuk LP existing → orphan.
    const graceCutoff = new Date(
      Date.now() - ORPHAN_GRACE_DAYS * 24 * 60 * 60 * 1000,
    )
    const candidates = await prisma.lpImage.findMany({
      where: { createdAt: { lt: graceCutoff } },
      select: {
        id: true,
        userId: true,
        url: true,
        size: true,
        filename: true,
        lpId: true,
      },
    })

    // Cache htmlContent per user — 1 LP query per user yg punya orphan candidate.
    const userHtmlCache = new Map<string, string>()
    async function htmlBlobFor(userId: string): Promise<string> {
      const hit = userHtmlCache.get(userId)
      if (hit !== undefined) return hit
      const lps = await prisma.landingPage.findMany({
        where: { userId },
        select: { htmlContent: true },
      })
      const blob = lps.map((l) => l.htmlContent).join('\n')
      userHtmlCache.set(userId, blob)
      return blob
    }

    for (const img of candidates) {
      try {
        const blob = await htmlBlobFor(img.userId)
        const isReferenced = blob.includes(img.url)
        if (isReferenced) continue

        // Tidak ke-reference. Sekalipun lpId-nya valid, kalau URL tidak ada
        // di HTML manapun → user pernah pasang lalu lepas, file aman dihapus.

        // Hapus file fisik. Path: /app/public + url.
        // Url format: /uploads/lp-images/<userId>/<filename>
        const filePath = path.join(process.cwd(), 'public', img.url)
        try {
          await unlink(filePath)
          stats.orphanFilesDeleted++
        } catch (err) {
          // File mungkin sudah dihapus manual; tetap delete record-nya.
          const code = (err as NodeJS.ErrnoException)?.code
          if (code !== 'ENOENT') {
            stats.errors.push(
              `unlink ${img.filename}: ${(err as Error).message}`,
            )
          }
        }

        await prisma.lpImage.delete({ where: { id: img.id } })
        stats.orphanRecordsDeleted++
        stats.storageReleasedMB += img.size / (1024 * 1024)
        // Decrement storage usage milik owner.
        await updateStorageUsed(
          img.userId,
          -(img.size / (1024 * 1024)),
        ).catch((err) =>
          stats.errors.push(
            `updateStorage ${img.userId}: ${(err as Error).message}`,
          ),
        )
      } catch (err) {
        stats.errors.push(`${img.id}: ${(err as Error).message}`)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...stats,
        storageReleasedMB: Math.round(stats.storageReleasedMB * 100) / 100,
      },
    })
  } catch (err) {
    console.error('[POST /api/cron/cleanup-lp] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error', stats },
      { status: 500 },
    )
  }
}
