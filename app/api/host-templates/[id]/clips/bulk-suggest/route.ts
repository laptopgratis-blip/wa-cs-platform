// POST /api/host-templates/[id]/clips/bulk-suggest — Claude generate N script
// untuk klip library, balik list editable ke client.
//
// Body: { productName, productDescription?, price?, benefits?[], targetCustomer?,
//         brandTone?, count: 5|10|15|20 }
// Returns: { scripts: [{category, script, charCount}, ...] }
//
// COST: ~Rp 100-300 per call (Claude Haiku 4.5, ~1500-3000 tokens).
// User review/edit dulu sebelum committing ke bulk-generate.

import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { suggestScripts } from '@/lib/services/clip-library/script-suggester'

const schema = z.object({
  productName: z.string().trim().min(2).max(200),
  productDescription: z.string().trim().max(1000).optional(),
  price: z.number().int().nonnegative().optional(),
  benefits: z.array(z.string().trim().max(200)).max(5).optional(),
  targetCustomer: z.string().trim().max(200).optional(),
  brandTone: z.string().trim().max(200).optional(),
  count: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params

  const host = await prisma.hostTemplate.findUnique({
    where: { id },
    select: { id: true, userId: true, mode: true },
  })
  if (!host) return jsonError('Host tidak ditemukan', 404)
  if (session.user.role !== 'ADMIN' && host.userId !== session.user.id) {
    return jsonError('Tidak punya akses', 403)
  }
  if (host.mode !== 'NATIVE_LIBRARY') {
    return jsonError('Host bukan mode Klip Live', 400)
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body invalid', 400)
  }

  try {
    const scripts = await suggestScripts({ ...parsed.data, userId: host.userId })
    return jsonOk({ scripts, count: scripts.length })
  } catch (e) {
    return jsonError((e as Error).message, 500)
  }
}
