// /lms/courses/[courseId]/edit — builder course (modules + lessons).
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { CourseBuilder } from '@/components/lms/CourseBuilder'
import { Button } from '@/components/ui/button'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCourseForOwner } from '@/lib/services/lms/course'
import { getActiveLmsQuota } from '@/lib/services/lms/quota'

interface Params {
  params: Promise<{ courseId: string }>
}

export const dynamic = 'force-dynamic'

export default async function EditCoursePage({ params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { courseId } = await params
  const course = await getCourseForOwner(session.user.id, courseId)
  if (!course) redirect('/lms/courses')

  // Pre-fetch produk available untuk re-link (include current product
  // supaya tidak hilang dari dropdown).
  const [products, quota] = await Promise.all([
    prisma.product.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
        OR: [{ courseId: null }, { courseId: courseId }],
      },
      select: { id: true, name: true, price: true, courseId: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    }),
    getActiveLmsQuota(session.user.id),
  ])

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link href="/lms/courses">
            <ArrowLeft className="mr-2 size-4" />
            Kembali ke Course Saya
          </Link>
        </Button>
      </div>

      <CourseBuilder
        course={{
          id: course.id,
          title: course.title,
          slug: course.slug,
          description: course.description,
          status: course.status,
          coverUrl: course.coverUrl,
          productId: course.product?.id ?? null,
          modules: course.modules.map((m) => ({
            id: m.id,
            title: m.title,
            sortOrder: m.sortOrder,
            lessons: m.lessons.map((l) => ({
              id: l.id,
              title: l.title,
              contentType: l.contentType,
              videoEmbedUrl: l.videoEmbedUrl,
              richTextHtml: l.richTextHtml,
              durationSec: l.durationSec,
              isFreePreview: l.isFreePreview,
              dripDays: l.dripDays,
              sortOrder: l.sortOrder,
            })),
          })),
        }}
        availableProducts={products}
        quota={{
          tier: quota.tier,
          canUseDripSchedule: quota.canUseDripSchedule,
          canIssueCertificate: quota.canIssueCertificate,
        }}
      />
    </div>
  )
}
