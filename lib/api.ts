// Helper bersama untuk API routes.
import { getServerSession, type Session } from 'next-auth'
import { NextResponse } from 'next/server'

import { authOptions } from '@/lib/auth'

// Pastikan ada user login. Kalau tidak, throw response 401 — caller bisa
// langsung lempar atau biarkan handler `try/catch` membungkus.
export async function requireSession(): Promise<Session> {
  const session = await getServerSession(authOptions)
  if (!session) {
    throw NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }
  return session
}

// Sama seperti requireSession() tapi juga cek role ADMIN. Throw 403 kalau bukan.
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession()
  if (session.user.role !== 'ADMIN') {
    throw NextResponse.json(
      { success: false, error: 'forbidden — butuh akses admin' },
      { status: 403 },
    )
  }
  return session
}

// Untuk endpoint yang boleh diakses FINANCE atau ADMIN (mis. verifikasi
// manual payment).
export async function requireFinanceOrAdmin(): Promise<Session> {
  const session = await requireSession()
  if (session.user.role !== 'ADMIN' && session.user.role !== 'FINANCE') {
    throw NextResponse.json(
      { success: false, error: 'forbidden — butuh akses admin atau finance' },
      { status: 403 },
    )
  }
  return session
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status })
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}
