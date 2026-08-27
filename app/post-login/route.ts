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

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  // `next` opsional: tujuan semula user sebelum ditendang ke /login.
  const next = new URL(req.url).searchParams.get('next')
  const target = resolveLoginRedirect(next, session.user.role)
  return NextResponse.redirect(new URL(target, req.url))
}
