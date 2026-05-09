// GET /api/lms-subscription/preview?lmsPackageId=...&durationMonths=...
// Read-only cost breakdown sebelum checkout. Mirror /api/subscription/preview
// (LP) tapi untuk LmsUpgradePackage.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { previewLmsCheckout } from '@/lib/services/lms/subscription'
import { VALID_DURATIONS } from '@/lib/subscription-pricing'

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const url = new URL(req.url)
  const lmsPackageId = url.searchParams.get('lmsPackageId')
  const durationMonths = Number(url.searchParams.get('durationMonths'))
  if (!lmsPackageId) return jsonError('lmsPackageId wajib diisi')
  if (!VALID_DURATIONS.includes(durationMonths)) {
    return jsonError(
      `durationMonths harus salah satu: ${VALID_DURATIONS.join(', ')}`,
    )
  }
  try {
    const data = await previewLmsCheckout({
      userId: session.user.id,
      lmsPackageId,
      durationMonths,
    })
    return jsonOk(data)
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Gagal preview', 400)
  }
}
