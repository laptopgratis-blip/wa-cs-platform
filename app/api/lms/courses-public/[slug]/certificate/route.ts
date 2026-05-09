// POST /api/lms/courses-public/[slug]/certificate
// Student trigger issue certificate. Cek eligibility (enrolled + all
// lesson completed + plan owner support certificate). Idempotent.
import { jsonError, jsonOk } from '@/lib/api'
import {
  CertificateError,
  issueCertificateIfEligible,
} from '@/lib/services/lms/certificate'
import {
  STUDENT_COOKIE_NAME,
  getStudentFromSessionToken,
} from '@/lib/services/lms/student-auth'

interface Params {
  params: Promise<{ slug: string }>
}

export async function POST(req: Request, { params }: Params) {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const match = cookieHeader.match(
    new RegExp(`(?:^|; )${STUDENT_COOKIE_NAME}=([^;]+)`),
  )
  const ctx = match?.[1]
    ? await getStudentFromSessionToken(match[1])
    : null
  if (!ctx) return jsonError('unauthorized', 401)

  const { slug } = await params
  try {
    const cert = await issueCertificateIfEligible({
      studentPhone: ctx.studentPhone,
      courseSlug: slug,
    })
    return jsonOk({ certificate: cert })
  } catch (err) {
    if (err instanceof CertificateError) {
      const status =
        err.code === 'NOT_ENROLLED'
          ? 403
          : err.code === 'PLAN_NOT_SUPPORTED'
            ? 402
            : 400
      return Response.json(
        { success: false, error: err.code, message: err.message },
        { status },
      )
    }
    console.error('[POST certificate]', err)
    return jsonError('Gagal issue sertifikat', 500)
  }
}
