// GET/PUT /api/cs-ai/integrations
//
// Bacaan & toggle integrasi CS AI: katalog produk + hitung ongkir. Setting
// dipakai oleh /api/internal/knowledge/[sessionId] untuk inject context ke
// system prompt CS AI saat pesan masuk.
//
// GET juga return "prerequisites" supaya UI bisa tampilkan setup CTA:
//   - hasActiveProducts: ada >=1 produk aktif → katalog masuk akal di-aktif
//   - hasShippingOrigin: UserShippingProfile.originCityId di-set → ongkir bisa
//     dihitung. Kalau belum, toggle ongkir disabled + link "Setup origin →".
import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface PutBody {
  productCatalogEnabled?: unknown
  shippingCalcEnabled?: unknown
  applySubsidyRules?: unknown
  applyFlashSaleDiscount?: unknown
}

// Ambil setting atau bikin row default kalau belum ada (idempotent).
async function getOrCreateIntegration(userId: string) {
  const existing = await prisma.csAiIntegration.findUnique({
    where: { userId },
  })
  if (existing) return existing
  return prisma.csAiIntegration.create({
    data: { userId },
  })
}

async function loadPrerequisites(userId: string) {
  const [activeProductCount, profile, activeSubsidyZoneCount] =
    await Promise.all([
      prisma.product.count({ where: { userId, isActive: true } }),
      prisma.userShippingProfile.findUnique({
        where: { userId },
        select: {
          originCityName: true,
          originCityId: true,
          enabledCouriers: true,
        },
      }),
      prisma.shippingZone.count({
        where: {
          userId,
          isActive: true,
          subsidyType: { not: 'NONE' },
        },
      }),
    ])

  return {
    hasActiveProducts: activeProductCount > 0,
    activeProductCount,
    hasShippingOrigin: !!profile?.originCityId,
    originCityName: profile?.originCityName ?? null,
    enabledCourierCount: profile?.enabledCouriers.length ?? 0,
    activeSubsidyZoneCount,
  }
}

export async function GET() {
  try {
    const session = await requireSession()
    const [integration, prerequisites] = await Promise.all([
      getOrCreateIntegration(session.user.id),
      loadPrerequisites(session.user.id),
    ])
    return jsonOk({
      productCatalogEnabled: integration.productCatalogEnabled,
      shippingCalcEnabled: integration.shippingCalcEnabled,
      applySubsidyRules: integration.applySubsidyRules,
      applyFlashSaleDiscount: integration.applyFlashSaleDiscount,
      prerequisites,
    })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[cs-ai/integrations GET]', e)
    return jsonError('Gagal memuat setting', 500)
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireSession()
    const body = (await req.json().catch(() => ({}))) as PutBody

    // Build patch hanya untuk field yang dikirim — supaya partial update.
    const data: {
      productCatalogEnabled?: boolean
      shippingCalcEnabled?: boolean
      applySubsidyRules?: boolean
      applyFlashSaleDiscount?: boolean
    } = {}
    if (typeof body.productCatalogEnabled === 'boolean') {
      data.productCatalogEnabled = body.productCatalogEnabled
    }
    if (typeof body.shippingCalcEnabled === 'boolean') {
      data.shippingCalcEnabled = body.shippingCalcEnabled
    }
    if (typeof body.applySubsidyRules === 'boolean') {
      data.applySubsidyRules = body.applySubsidyRules
    }
    if (typeof body.applyFlashSaleDiscount === 'boolean') {
      data.applyFlashSaleDiscount = body.applyFlashSaleDiscount
    }
    if (Object.keys(data).length === 0) {
      return jsonError('Tidak ada field yang diubah', 400)
    }

    // Guard: aktifkan shipping butuh origin diset. Tolak di server supaya UI
    // tidak bisa nge-bypass dengan direct API call.
    if (data.shippingCalcEnabled === true) {
      const profile = await prisma.userShippingProfile.findUnique({
        where: { userId: session.user.id },
        select: { originCityId: true },
      })
      if (!profile?.originCityId) {
        return jsonError(
          'Setup kota asal pengiriman dulu di halaman Bank & Pengiriman sebelum mengaktifkan hitung ongkir',
          400,
        )
      }
    }

    const updated = await prisma.csAiIntegration.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, ...data },
      update: data,
    })

    return jsonOk({
      productCatalogEnabled: updated.productCatalogEnabled,
      shippingCalcEnabled: updated.shippingCalcEnabled,
      applySubsidyRules: updated.applySubsidyRules,
      applyFlashSaleDiscount: updated.applyFlashSaleDiscount,
    })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[cs-ai/integrations PUT]', e)
    return jsonError('Gagal menyimpan setting', 500)
  }
}
