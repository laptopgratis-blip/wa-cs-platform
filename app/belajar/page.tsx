// /belajar — entry portal student. Server-side cek cookie:
//   - Belum login → tampilkan form login (LoginForm)
//   - Sudah login → tampilkan dashboard course (StudentDashboard)
//
// Tidak pakai middleware auth karena route ini publik (cookie student
// cuma di-resolve di sini, tidak di NextAuth).
import { cookies } from 'next/headers'

import { LoginForm } from '@/components/belajar/LoginForm'
import { StudentDashboard } from '@/components/belajar/StudentDashboard'
import {
  STUDENT_COOKIE_NAME,
  getStudentFromSessionToken,
} from '@/lib/services/lms/student-auth'
import { getStudentEnrollments } from '@/lib/services/lms/student-portal'

export const dynamic = 'force-dynamic'

export default async function BelajarHomePage() {
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
            Login pakai nomor WhatsApp yg dipakai saat order course.
          </p>
        </div>
        <LoginForm />
      </div>
    )
  }

  const enrollments = await getStudentEnrollments(ctx.studentPhone)
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
    />
  )
}
