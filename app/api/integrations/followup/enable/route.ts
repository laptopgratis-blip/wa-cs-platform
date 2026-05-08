// POST /api/integrations/followup/enable
//
// First-time enable: auto-seed 7 default template (idempotent — kalau user
// sudah punya template, no-op). Pasangan untuk halaman /pesanan/templates yang
// kosong saat user pertama kali buka.
import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { seedDefaultTemplates } from '@/lib/services/followup-defaults'

export async function POST() {
  try {
    const { session } = await requireOrderSystemAccess()
    const seeded = await seedDefaultTemplates(session.user.id)
    return jsonOk({ seeded, alreadyHadTemplates: seeded === 0 })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[followup/enable]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
