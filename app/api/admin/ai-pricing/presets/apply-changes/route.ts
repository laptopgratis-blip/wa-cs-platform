// POST /api/admin/ai-pricing/presets/apply-changes
// Body: { jobId, modelIds: string[] } — apply diff dari research yang
// admin pilih (centang).
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { applyChanges } from '@/lib/services/ai-pricing-research'

const bodySchema = z.object({
  jobId: z.string().min(1),
  modelIds: z.array(z.string()).max(100),
})

export async function POST(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const r = await applyChanges(parsed.data.modelIds, parsed.data.jobId)
    return jsonOk(r)
  } catch (err) {
    console.error('[POST /api/admin/ai-pricing/presets/apply-changes] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
