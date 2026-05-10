// GET /api/content/insights — agregat performance konten user
// (avg reach per channel/funnel/method + top 3 winner pieces)
import type { NextResponse } from 'next/server'

import { jsonOk, requireSession } from '@/lib/api'
import { getInsightsForUser } from '@/lib/services/content/insights'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const insights = await getInsightsForUser(session.user.id)
  return jsonOk({ insights })
}
