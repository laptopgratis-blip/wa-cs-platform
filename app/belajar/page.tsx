// /belajar — entry portal student. Server-side cek cookie:
//   - Belum login → tampilkan form login (LoginForm)
//   - Sudah login → tampilkan dashboard course (StudentDashboard)
//
// Tidak pakai middleware auth karena route ini publik (cookie student
// cuma di-resolve di sini, tidak di NextAuth).
import { cookies } from 'next/headers'

import { LoginForm } from '@/components/belajar/LoginForm'
import { StudentDashboard } from '@/components/belajar/StudentDashboard'
import { getStudentEbooks } from '@/lib/services/ebook/portal'
import { getStudentCertificates } from '@/lib/services/lms/certificate'
import {
  STUDENT_COOKIE_NAME,
  getStudentFromSessionToken,
} from '@/lib/services/lms/student-auth'
import { getStudentEnrollments } from '@/lib/services/lms/student-portal'

export const dynamic = 'force-dynamic'

interface PageProps {
  // magic_error diisi redirect dari /belajar/auto saat magic link gagal
  // (kedaluwarsa/dicabut/error) — tampil sebagai banner di atas form login.
  searchParams: Promise<{ magic_error?: string }>
}

export default async function BelajarHomePage({ searchParams }: PageProps) {
  const { magic_error: magicError } = await searchParams
  const cookieStore = await cookies()
  const token = cookieStore.get(STUDENT_COOKIE_NAME)?.value
  const ctx = await getStudentFromSessionToken(token)

  if (!ctx) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl font-extrabold text-warm-900">
            Masuk ke Portal Belajar
          </h1>
          <p className="mt-2 text-sm text-warm-600">
            Login pakai nomor WhatsApp yg dipakai saat order.
          </p>
        </div>
        {magicError && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <p className="font-semibold">Tidak bisa login otomatis</p>
            <p className="mt-0.5">{magicError}</p>
            <p className="mt-1 text-xs text-rose-700">
              Silakan login manual di bawah, atau minta penjual kirim ulang
              link akses.
            </p>
          </div>
        )}
        <LoginForm />
      </div>
    )
  }

  const [enrollments, certificates, ebooks] = await Promise.all([
    getStudentEnrollments(ctx.studentPhone),
    getStudentCertificates(ctx.studentPhone),
    getStudentEbooks(ctx.studentPhone),
  ])
  return (
    <StudentDashboard
      student={{
        phone: ctx.studentPhone,
        name: ctx.studentName,
      }}
      enrollments={enrollments.map((e) => ({
        ...e,
        enrolledAt: e.enrolledAt.toISOString(),
        expiresAt: e.expiresAt?.toISOString() ?? null,
      }))}
      certificates={certificates.map((c) => ({
        ...c,
        issuedAt: c.issuedAt.toISOString(),
      }))}
      ebooks={ebooks.map((b) => ({
        ...b,
        grantedAt: b.grantedAt.toISOString(),
        expiresAt: b.expiresAt?.toISOString() ?? null,
      }))}
    />
  )
}
