// GET /api/lms/products-available?excludeCourseId=<id>
// List produk milik user yg BELUM di-link ke course (atau di-link ke
// excludeCourseId — supaya bisa edit course tanpa kehilangan link existing).
// Dipakai di UI saat bikin/edit course → dropdown pilih product.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const url = new URL(req.url)
  const excludeCourseId = url.searchParams.get('excludeCourseId')

  const products = await prisma.product.findMany({
    where: {
      userId: session.user.id,
      isActive: true,
      OR: [
        { courseId: null },
        ...(excludeCourseId ? [{ courseId: excludeCourseId }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      price: true,
      imageUrl: true,
      courseId: true,
    },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
  })
  return jsonOk({ products })
}
