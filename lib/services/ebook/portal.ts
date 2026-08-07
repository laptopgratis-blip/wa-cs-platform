// Data perpustakaan e-book untuk portal /belajar (sisi pembeli).
// Identitas = studentPhone dari cookie belajar-session — sama dengan
// EbookEntitlement.buyerPhone (satu normalizer, lihat order-hook).
import { prisma } from '@/lib/prisma'

export interface StudentEbookItem {
  entitlementId: string
  // Status EFEKTIF untuk UI: ACTIVE yang expiresAt-nya lewat ditampilkan
  // EXPIRED walau row DB belum di-lazy-expire (enforcement tetap di endpoint
  // download, bukan di sini).
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED'
  grantedAt: Date
  expiresAt: Date | null
  downloadCount: number
  maxDownloads: number
  ebook: {
    id: string
    title: string
    description: string | null
    coverUrl: string | null
    fileFormat: 'PDF' | 'EPUB'
    fileSizeBytes: number
  }
}

export async function getStudentEbooks(
  studentPhone: string,
): Promise<StudentEbookItem[]> {
  const rows = await prisma.ebookEntitlement.findMany({
    where: { buyerPhone: studentPhone },
    orderBy: { grantedAt: 'desc' },
    select: {
      id: true,
      status: true,
      grantedAt: true,
      expiresAt: true,
      downloadCount: true,
      maxDownloads: true,
      ebook: {
        select: {
          id: true,
          title: true,
          description: true,
          coverUrl: true,
          fileFormat: true,
          fileSizeBytes: true,
        },
      },
    },
  })

  const now = Date.now()
  return rows
    .filter((r) => r.ebook != null)
    .map((r) => ({
      entitlementId: r.id,
      status:
        r.status === 'ACTIVE' && r.expiresAt && r.expiresAt.getTime() < now
          ? 'EXPIRED'
          : r.status,
      grantedAt: r.grantedAt,
      expiresAt: r.expiresAt,
      downloadCount: r.downloadCount,
      maxDownloads: r.maxDownloads,
      ebook: r.ebook,
    }))
}
