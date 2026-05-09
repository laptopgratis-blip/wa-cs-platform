// POST /api/lms/auth/logout
// Hapus session di DB + clear cookie.
import { jsonOk } from '@/lib/api'
import {
  STUDENT_COOKIE_NAME,
  destroySession,
} from '@/lib/services/lms/student-auth'

export async function POST(req: Request) {
  // Parse cookie manual karena ini route public — tidak pakai NextAuth.
  const cookieHeader = req.headers.get('cookie') ?? ''
  const match = cookieHeader.match(
    new RegExp(`(?:^|; )${STUDENT_COOKIE_NAME}=([^;]+)`),
  )
  const token = match?.[1]
  if (token) {
    await destroySession(token)
  }
  const res = Response.json({ success: true, data: { ok: true } })
  // Clear cookie dgn Max-Age=0.
  res.headers.append(
    'Set-Cookie',
    `${STUDENT_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  )
  return res
}
