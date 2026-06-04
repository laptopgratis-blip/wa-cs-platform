// GET /api/host-scene-templates — list preset scene grouped by category.
import type { NextResponse } from 'next/server'

import { jsonOk, requireSession } from '@/lib/api'
import {
  SCENE_CATEGORY_LABEL,
  SCENE_TEMPLATES,
} from '@/lib/services/host-gen/scene-templates'

export async function GET() {
  try {
    await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  return jsonOk({
    categories: SCENE_CATEGORY_LABEL,
    templates: SCENE_TEMPLATES,
  })
}
