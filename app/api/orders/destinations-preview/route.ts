// GET /api/orders/destinations-preview?slug=&q= (PUBLIC, no-auth)
// Customer di public form butuh autocomplete destinasi tanpa auth. Untuk
// mencegah abuse Komerce API budget:
//   - require valid slug (hanya form yang ada yang bisa pakai endpoint ini)
//   - rate limit per IP (incident kuota jebol 2026-07-10)
import { jsonError, jsonOk } from '@/lib/api'
import { getClientIp } from '@/lib/client-ip'
import { prisma } from '@/lib/prisma'
import { searchDestinations } from '@/lib/services/rajaongkir'
import { checkDestinationSearchLimit } from '@/lib/services/shipping-rate-limit'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const slug = url.searchParams.get('slug') ?? ''
  const q = url.searchParams.get('q') ?? ''

  if (!slug) return jsonError('Slug form wajib', 400)
  if (q.trim().length < 2) return jsonOk({ items: [], degraded: false })

  const limit = checkDestinationSearchLimit(getClientIp(req))
  if (!limit.ok) {
    return jsonError(
      'Terlalu banyak pencarian. Tunggu sebentar lalu coba lagi.',
      429,
    )
  }

  // Cek slug exists & form aktif (defense-in-depth — biaya minim).
  const form = await prisma.orderForm.findUnique({
    where: { slug },
    select: { isActive: true },
  })
  if (!form || !form.isActive) {
    return jsonError('Form tidak ditemukan', 404)
  }

  try {
    const { items, degraded } = await searchDestinations(q, 10)
    return jsonOk({ items, degraded })
  } catch (err) {
    console.error('[GET /api/orders/destinations-preview] gagal:', err)
    return jsonError('Gagal cari alamat', 500)
  }
}
