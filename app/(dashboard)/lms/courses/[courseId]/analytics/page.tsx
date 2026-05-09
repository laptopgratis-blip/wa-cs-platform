// /lms/courses/[courseId]/analytics — dashboard analytics seller per course (Phase 5).
import { ArrowLeft, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { CourseAnalyticsClient } from '@/components/lms-lab/CourseAnalyticsClient'
import { Button } from '@/components/ui/button'
import { authOptions } from '@/lib/auth'
import { getCourseForOwner } from '@/lib/services/lms/course'

interface Params {
  params: Promise<{ courseId: string }>
}

export const dynamic = 'force-dynamic'

export default async function CourseAnalyticsPage({ params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { courseId } = await params
  const course = await getCourseForOwner(session.user.id, courseId)
  if (!course) redirect('/lms/courses')

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link href="/lms/courses">
            <ArrowLeft className="mr-2 size-4" />
            Kembali ke Course Saya
          </Link>
        </Button>
        <div className="mb-1 flex items-center gap-2">
          <BarChart3 className="size-5 text-primary-500" />
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
            Analytics — {course.title}
          </h1>
        </div>
        <p className="text-sm text-warm-500">
          Performa course: enrollment, completion, dropout per lesson. Update
          realtime saat student progress.
        </p>
      </div>

      <CourseAnalyticsClient courseId={course.id} />
    </div>
  )
}
