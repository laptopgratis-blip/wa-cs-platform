// GET /api/lms/courses/[courseId]/analytics?days=7|30|90
// Aggregate analytics seller per course — Phase 5.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import {
  getCourseAnalytics,
  parseRangeDays,
} from '@/lib/services/lms/analytics'

interface Params {
  params: Promise<{ courseId: string }>
}

export async function GET(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { courseId } = await params
  const url = new URL(req.url)
  const days = parseRangeDays(url.searchParams.get('days'))
  const result = await getCourseAnalytics(session.user.id, courseId, days)
  if (!result) return jsonError('Course tidak ditemukan', 404)
  return jsonOk(result)
}
