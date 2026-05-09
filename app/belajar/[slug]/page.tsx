// /belajar/[slug] — course player. Cek session student, fetch course
// dgn gate per lesson (free preview vs enrolled).
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'

import { CoursePlayer } from '@/components/belajar/CoursePlayer'
import { LoginForm } from '@/components/belajar/LoginForm'
import {
  STUDENT_COOKIE_NAME,
  getStudentFromSessionToken,
} from '@/lib/services/lms/student-auth'
import { getCourseForStudent } from '@/lib/services/lms/student-portal'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ slug: string }>
}

export default async function BelajarCoursePage({ params }: Params) {
  const { slug } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get(STUDENT_COOKIE_NAME)?.value
  const ctx = await getStudentFromSessionToken(token)

  const data = await getCourseForStudent({
    studentPhone: ctx?.studentPhone ?? null,
    courseSlug: slug,
  })
  if (!data) notFound()

  // Kalau tidak enrolled DAN tidak ada free preview lesson, tampilkan
  // gate dgn login form.
  const hasFreePreview = data.modules.some((m) =>
    m.lessons.some((l) => l.isFreePreview),
  )
  if (!data.isEnrolled && !hasFreePreview) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="mb-6">
          <Link
            href="/belajar"
            className="text-xs text-warm-500 hover:text-warm-700"
          >
            <ArrowLeft className="mr-1 inline size-3" />
            Kembali
          </Link>
        </div>
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-extrabold text-warm-900">
            {data.course.title}
          </h1>
          <p className="mt-2 text-sm text-warm-600">
            Login pakai nomor WA yg dipakai saat order untuk akses course.
          </p>
        </div>
        <LoginForm />
      </div>
    )
  }

  return (
    <CoursePlayer
      course={data.course}
      isEnrolled={data.isEnrolled}
      certificateNumber={data.certificateNumber}
      ownerCanIssueCertificate={data.ownerCanIssueCertificate}
      modules={data.modules.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => ({
          ...l,
          completedAt: l.completedAt?.toISOString() ?? null,
        })),
      }))}
    />
  )
}
