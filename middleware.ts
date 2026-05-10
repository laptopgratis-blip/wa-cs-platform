// Middleware proteksi route — pakai withAuth dari NextAuth (JWT-based).
// Cek role untuk path /admin/*; semua /dashboard/* hanya butuh login.
//
// Role rules:
// - ADMIN: akses semua /admin/*
// - FINANCE: hanya boleh /admin/finance/* (untuk verifikasi transfer manual)
// - USER: tidak boleh /admin/*, di-redirect ke /dashboard
import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl
    const role = req.nextauth.token?.role

    if (pathname.startsWith('/admin')) {
      if (role === 'ADMIN') return NextResponse.next()
      if (role === 'FINANCE' && pathname.startsWith('/admin/finance')) {
        return NextResponse.next()
      }
      const url = req.nextUrl.clone()
      url.pathname = role === 'FINANCE' ? '/admin/finance' : '/dashboard'
      return NextResponse.redirect(url)
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      // Cukup ada token = sudah login. Cek role dilakukan di handler di atas.
      authorized: ({ token }) => Boolean(token),
    },
    pages: {
      signIn: '/login',
    },
  },
)

export const config = {
  // Lindungi /dashboard, /admin, /onboarding (semua sub-route).
  // Path lain (/, /login, /register, /p/<slug>, /api/*) sengaja tidak masuk
  // matcher — itu publik. Khususnya /p/<slug> harus bisa dibuka tanpa auth
  // karena LP yang dipublish user perlu accessible oleh end-customer.
  matcher: ['/dashboard/:path*', '/admin/:path*', '/onboarding/:path*'],
}
