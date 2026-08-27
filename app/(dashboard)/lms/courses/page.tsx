// /lms/courses — list course penjual + tombol bikin baru.
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { CoursesList } from '@/components/lms/CoursesList'
import { OnboardingHint } from '@/components/onboarding/OnboardingHint'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { authOptions } from '@/lib/auth'
import {
  PHASE1_FREE_MAX_COURSES,
  listCoursesForOwner,
} from '@/lib/services/lms/course'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function LmsCoursesPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const courses = await listCoursesForOwner(session.user.id)
  const activeCount = courses.filter((c) => c.status !== 'ARCHIVED').length

  return (
    <PageContainer>
      <OnboardingHint
        hintId="lms-courses"
        relevantFor={['LMS']}
        matchMessage="Mulai dengan course pendek (5-7 lesson) buat MVP. Setelah customer beli produk yang kamu link ke course, akses otomatis dikirim via WA."
        mismatchMessage="LMS buat jualan course / produk digital. Kalau cuma jualan produk fisik, kamu nggak butuh menu ini."
      />
      <PageHeader
        title="Course Saya"
        description="Bikin produk digital dan e-course. Customer yang beli produk yang di-link ke course otomatis dapat akses."
        actions={
          <Button asChild disabled={activeCount >= PHASE1_FREE_MAX_COURSES}>
            <Link href="/lms/courses/new">
              <Plus className="mr-2 size-4" />
              Buat Course Baru
            </Link>
          </Button>
        }
      />

      {/* Panel catatan beta — warna lewat registry tone, bukan palet mentah. */}
      <div
        className={cn(
          'rounded-xl border p-3 text-sm',
          TONES.warning.bg,
          TONES.warning.border,
          TONES.warning.text,
        )}
      >
        <strong>Phase 1 BETA</strong> — limit {PHASE1_FREE_MAX_COURSES} course
        aktif & 5 lesson per course. Plan upgrade dgn token unlock di Phase 3.
        Phase 1 hanya support video embed (YouTube/Vimeo) + teks; upload file
        masuk Phase 2.
      </div>

      <CoursesList courses={courses} />
    </PageContainer>
  )
}
