// GET /api/lms/me
// Return student session info + list enrollment ACTIVE.
// Kalau cookie tidak valid → 401 (UI redirect ke /belajar/login).
import { jsonError, jsonOk } from '@/lib/api'
import { getStudentCertificates } from '@/lib/services/lms/certificate'
import {
  STUDENT_COOKIE_NAME,
  getStudentFromSessionToken,
} from '@/lib/services/lms/student-auth'
import { getStudentEnrollments } from '@/lib/services/lms/student-portal'

function readSessionTokenFromHeader(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const match = cookieHeader.match(
    new RegExp(`(?:^|; )${STUDENT_COOKIE_NAME}=([^;]+)`),
  )
  return match?.[1] ?? null
}

export async function GET(req: Request) {
  const token = readSessionTokenFromHeader(req)
  const ctx = await getStudentFromSessionToken(token)
  if (!ctx) return jsonError('unauthorized', 401)

  const [enrollments, certificates] = await Promise.all([
    getStudentEnrollments(ctx.studentPhone),
    getStudentCertificates(ctx.studentPhone),
  ])
  return jsonOk({
    student: {
      phone: ctx.studentPhone,
      name: ctx.studentName,
      email: ctx.studentEmail,
    },
    enrollments,
    certificates: certificates.map((c) => ({
      ...c,
      issuedAt: c.issuedAt.toISOString(),
    })),
  })
}
