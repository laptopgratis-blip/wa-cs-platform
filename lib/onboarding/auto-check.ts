// Auto-check evaluator untuk step onboarding. Tiap key di-resolve via
// count > 0 query ke DB. Tradeoff: user yg iseng buat dummy → step ke-tick.
// Acceptable untuk onboarding (low stakes), bukan untuk gating fitur.
import { prisma } from '@/lib/prisma'

import type { AutoCheckKey } from './checklists'

/**
 * Evaluate semua key sekaligus secara paralel untuk satu user. Lebih hemat
 * roundtrip dibanding evaluate satu-satu.
 */
export async function evaluateAutoChecks(
  userId: string,
  keys: AutoCheckKey[],
): Promise<Record<AutoCheckKey, boolean>> {
  const unique = Array.from(new Set(keys))
  const results = await Promise.all(unique.map((k) => evaluateOne(userId, k)))
  const out = {} as Record<AutoCheckKey, boolean>
  unique.forEach((k, i) => {
    out[k] = results[i] ?? false
  })
  return out
}

async function evaluateOne(
  userId: string,
  key: AutoCheckKey,
): Promise<boolean> {
  switch (key) {
    case 'wa_connected':
      return (
        (await prisma.whatsappSession.count({
          where: { userId, status: 'CONNECTED' },
        })) > 0
      )
    case 'soul_configured':
      return (await prisma.soul.count({ where: { userId } })) > 0
    case 'knowledge_added':
      return (await prisma.userKnowledge.count({ where: { userId } })) > 0
    case 'product_added':
      return (await prisma.product.count({ where: { userId } })) > 0
    case 'shipping_zone_added':
      return (await prisma.shippingZone.count({ where: { userId } })) > 0
    case 'lp_published':
      return (
        (await prisma.landingPage.count({
          where: { userId, isPublished: true },
        })) > 0
      )
    case 'order_form_added':
      return (await prisma.orderForm.count({ where: { userId } })) > 0
    case 'followup_enabled':
      return (await prisma.followUpTemplate.count({ where: { userId } })) > 0
    case 'sales_flow_added':
      return (await prisma.userSalesFlow.count({ where: { userId } })) > 0
    case 'bank_account_added':
      return (await prisma.userBankAccount.count({ where: { userId } })) > 0
    case 'course_added':
      return (await prisma.course.count({ where: { userId } })) > 0
    case 'lesson_added':
      // Lesson tidak punya userId langsung — lewat course → module → lesson.
      return (
        (await prisma.lesson.count({
          where: { module: { course: { userId } } },
        })) > 0
      )
    case 'lms_subscribed':
      // Cek user sudah punya LmsQuota aktif (artinya pernah subscribe).
      // FREE tier juga punya row LmsQuota auto-create — anggap "subscribed"
      // kalau tier !== 'FREE'.
      {
        const quota = await prisma.lmsQuota.findUnique({ where: { userId } })
        return quota !== null && quota.tier !== 'FREE'
      }
  }
}
