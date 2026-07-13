// /lms/courses/[courseId]/analytics — dashboard analytics seller per course (Phase 5).
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { CourseAnalyticsClient } from '@/components/lms-lab/CourseAnalyticsClient'
import { PageHeader } from '@/components/shared/PageHeader'
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
        <PageHeader
          title={`Analytics — ${course.title}`}
          description="Performa course: enrollment, completion, dropout per lesson. Update realtime saat student progress."
        />
      </div>

      <CourseAnalyticsClient courseId={course.id} />
    </div>
  )
}
