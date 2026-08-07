// GET /belajar/auto?t=<token> — consume magic link login student.
//
// ROUTE HANDLER, bukan page: Next.js 16 melarang set cookie dari Server
// Component ("Cookies can only be modified in a Server Action or Route
// Handler") — versi page lama gagal set cookie sesi di produksi (token
// terkonsumsi tapi login gagal, error "Tidak bisa login otomatis").
// Sukses → set cookie belajar-session + redirect /belajar.
// Gagal  → redirect /belajar?magic_error=<pesan> (banner di halaman login).
import { NextResponse } from 'next/server'

import { STUDENT_COOKIE_NAME } from '@/lib/services/lms/student-auth'
import {
  StudentMagicError,
  consumeMagicLink,
} from '@/lib/services/lms/student-magic'

export const dynamic = 'force-dynamic'

// Base URL redirect dari env publik — JANGAN dari req.url: di balik Traefik,
// req.url route handler berisi host bind internal (https://0.0.0.0:3000)
// sehingga Location redirect nyasar keluar domain (kejadian saat deploy
// pertama fix ini). Fallback origin request hanya untuk dev lokal.
function baseUrl(req: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    new URL(req.url).origin
  )
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const base = baseUrl(req)

  const errorRedirect = (message: string) =>
    NextResponse.redirect(
      `${base}/belajar?magic_error=${encodeURIComponent(message)}`,
      { status: 303 },
    )

  const t = url.searchParams.get('t')
  if (!t) return errorRedirect('Token tidak ditemukan di URL.')

  try {
    const result = await consumeMagicLink({
      token: t,
      userAgent: req.headers.get('user-agent') ?? undefined,
      ipAddress:
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        req.headers.get('x-real-ip') ??
        undefined,
    })

    const res = NextResponse.redirect(`${base}/belajar`, {
      status: 303,
    })
    res.cookies.set({
      name: STUDENT_COOKIE_NAME,
      value: result.sessionToken,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor((result.expiresAt.getTime() - Date.now()) / 1000),
    })
    return res
  } catch (err) {
    if (err instanceof StudentMagicError) {
      return errorRedirect(err.message)
    }
    console.error('[GET /belajar/auto]', err)
    return errorRedirect('Terjadi error. Coba lagi atau login manual.')
  }
}
