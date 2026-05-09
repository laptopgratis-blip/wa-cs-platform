// /belajar/auto?t=<token>
//
// Server route consume magic link token: cek valid → create StudentSession
// → set cookie → redirect ke /belajar. Kalau gagal, render error sederhana
// dgn link ke flow OTP normal.
//
// Pakai server component (bukan route handler) supaya bisa redirect dgn
// `redirect('/belajar')` setelah set-cookie via headers().
import { ArrowRight, ShieldAlert } from 'lucide-react'
import { cookies, headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  STUDENT_COOKIE_NAME,
} from '@/lib/services/lms/student-auth'
import {
  StudentMagicError,
  consumeMagicLink,
} from '@/lib/services/lms/student-magic'

interface SearchParams {
  searchParams: Promise<{ t?: string }>
}

export const dynamic = 'force-dynamic'

export default async function AutoLoginPage({ searchParams }: SearchParams) {
  const { t } = await searchParams
  if (!t) {
    return <ErrorView message="Token tidak ditemukan di URL." />
  }

  const hdrs = await headers()
  const userAgent = hdrs.get('user-agent') ?? undefined
  const ipAddress =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    hdrs.get('x-real-ip') ??
    undefined

  try {
    const result = await consumeMagicLink({
      token: t,
      userAgent,
      ipAddress,
    })
    const cookieStore = await cookies()
    const maxAge = Math.floor(
      (result.expiresAt.getTime() - Date.now()) / 1000,
    )
    cookieStore.set({
      name: STUDENT_COOKIE_NAME,
      value: result.sessionToken,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge,
    })
  } catch (err) {
    if (err instanceof StudentMagicError) {
      return <ErrorView message={err.message} />
    }
    console.error('[GET /belajar/auto]', err)
    return <ErrorView message="Terjadi error. Coba lagi atau login manual." />
  }

  redirect('/belajar')
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <ShieldAlert className="mb-3 size-10 text-rose-500" />
      <h1 className="font-display text-xl font-bold text-warm-900 dark:text-warm-50">
        Tidak bisa login otomatis
      </h1>
      <p className="mt-2 text-sm text-warm-600">{message}</p>
      <Link
        href="/belajar"
        className="mt-6 inline-flex items-center gap-1 rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
      >
        Login manual <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}
