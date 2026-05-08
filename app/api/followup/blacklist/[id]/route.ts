// DELETE /api/followup/blacklist/[id] — unblock customer
import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ id: string }>
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { session } = await requireOrderSystemAccess()
    const { id } = await params

    const existing = await prisma.followUpBlacklist.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })
    if (!existing) return jsonError('Blacklist entry tidak ditemukan', 404)

    await prisma.followUpBlacklist.delete({ where: { id } })
    return jsonOk({ deleted: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[followup/blacklist DELETE]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
