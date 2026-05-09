// GET /api/lms/courses-public/[slug]
// Public endpoint — semua orang bisa hit. Konten lesson lengkap hanya
// kalau enrolled (atau lesson isFreePreview). Locked lesson return
// metadata saja.
import { jsonError, jsonOk } from '@/lib/api'
import {
  STUDENT_COOKIE_NAME,
  getStudentFromSessionToken,
} from '@/lib/services/lms/student-auth'
import { getCourseForStudent } from '@/lib/services/lms/student-portal'

interface Params {
  params: Promise<{ slug: string }>
}

export async function GET(req: Request, { params }: Params) {
  const { slug } = await params

  // Resolve student session kalau ada cookie. Anon visitor tetap boleh
  // lihat free preview lessons.
  const cookieHeader = req.headers.get('cookie') ?? ''
  const match = cookieHeader.match(
    new RegExp(`(?:^|; )${STUDENT_COOKIE_NAME}=([^;]+)`),
  )
  const ctx = match?.[1]
    ? await getStudentFromSessionToken(match[1])
    : null

  const data = await getCourseForStudent({
    studentPhone: ctx?.studentPhone ?? null,
    courseSlug: slug,
  })
  if (!data) return jsonError('Course tidak ditemukan', 404)
  return jsonOk(data)
}
