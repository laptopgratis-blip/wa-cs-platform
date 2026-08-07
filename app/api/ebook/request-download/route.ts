// POST /api/ebook/request-download — minta token download dari Perpustakaan.
// Auth: cookie belajar-session (portal student, tanpa akun NextAuth).
// Body: { entitlementId }. Return: { url, expiresAt, remaining }.
import { jsonError, jsonOk } from '@/lib/api'
import { requestDownloadToken } from '@/lib/services/ebook/download'
import {
  STUDENT_COOKIE_NAME,
  getStudentFromSessionToken,
} from '@/lib/services/lms/student-auth'

function readSessionTokenFromHeader(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const match = cookieHeader.match(
    new RegExp(`(?:^|; )${STUDENT_COOKIE_NAME}=([^;]+)`),
  )
  return match?.[1] ?? null
}

// Kode deny → HTTP status yang tepat.
const DENY_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  REVOKED: 403,
  EXPIRED: 403,
  LIMIT: 403,
}

export async function POST(req: Request) {
  const sessionToken = readSessionTokenFromHeader(req)
  const ctx = await getStudentFromSessionToken(sessionToken)
  if (!ctx) return jsonError('unauthorized', 401)

  const body = await req.json().catch(() => null)
  const entitlementId =
    typeof body?.entitlementId === 'string' ? body.entitlementId : null
  if (!entitlementId) return jsonError('entitlementId wajib diisi', 400)

  try {
    const result = await requestDownloadToken({
      entitlementId,
      studentPhone: ctx.studentPhone,
      ipAddress:
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: req.headers.get('user-agent'),
    })
    if (!result.ok) {
      return jsonError(
        result.message ?? 'Tidak bisa membuat link download',
        DENY_STATUS[result.code ?? ''] ?? 400,
      )
    }
    return jsonOk({
      url: result.url,
      expiresAt: result.expiresAt?.toISOString(),
      remaining: result.remaining,
    })
  } catch (err) {
    console.error('[POST /api/ebook/request-download] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
