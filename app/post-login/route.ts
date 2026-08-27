// GET /post-login — pendaratan setelah login, meneruskan ke halaman sesuai role.
//
// Dipakai sebagai callbackUrl untuk provider yang melakukan REDIRECT PENUH
// (Google OAuth), di mana klien tidak sempat membaca role sebelum berpindah.
// Jalur credentials/OTP menghitung tujuannya sendiri di klien (lihat
// resolveLoginRedirect) karena di sana session sudah bisa dibaca.
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

import { authOptions } from '@/lib/auth'
import { resolveLoginRedirect } from '@/lib/auth-landing'

export const dynamic = 'force-dynamic'

/**
 * Redirect dengan Location RELATIF.
 *
 * JANGAN pakai `new URL(path, req.url)`: di balik proxy, req.url memakai alamat
 * bind internal container (mis. https://0.0.0.0:3000), sehingga browser
 * dilempar ke host yang tidak ada. Location relatif diselesaikan browser
 * terhadap alamat yang benar-benar dia buka, jadi aman di semua environment
 * tanpa perlu menebak host dari header.
 */
function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path } })
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return redirectTo('/login')
  // `next` opsional: tujuan semula user sebelum ditendang ke /login.
  const next = new URL(req.url).searchParams.get('next')
  return redirectTo(resolveLoginRedirect(next, session.user.role))
}
