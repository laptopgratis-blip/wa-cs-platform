// /lms/courses — list course penjual + tombol bikin baru.
import { GraduationCap, Plus } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { CoursesList } from '@/components/lms/CoursesList'
import { OnboardingHint } from '@/components/onboarding/OnboardingHint'
import { Button } from '@/components/ui/button'
import { authOptions } from '@/lib/auth'
import {
  PHASE1_FREE_MAX_COURSES,
  listCoursesForOwner,
} from '@/lib/services/lms/course'

export const dynamic = 'force-dynamic'

export default async function LmsCoursesPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const courses = await listCoursesForOwner(session.user.id)
  const activeCount = courses.filter((c) => c.status !== 'ARCHIVED').length

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <OnboardingHint
        hintId="lms-courses"
        relevantFor={['LMS']}
        matchMessage="Mulai dengan course pendek (5-7 lesson) buat MVP. Setelah customer beli produk yang kamu link ke course, akses otomatis dikirim via WA."
        mismatchMessage="LMS buat jualan course / produk digital. Kalau cuma jualan produk fisik, kamu nggak butuh menu ini."
      />
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <GraduationCap className="size-5 text-primary-500" />
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
              Course Saya
            </h1>
          </div>
          <p className="text-sm text-warm-500">
            Bikin produk digital dan e-course. Customer yang beli produk yang
            di-link ke course otomatis dapat akses.
          </p>
        </div>
        <Button
          asChild
          disabled={activeCount >= PHASE1_FREE_MAX_COURSES}
          className="bg-primary-500 text-white shadow-orange hover:bg-primary-600"
        >
          <Link href="/lms/courses/new">
            <Plus className="mr-2 size-4" />
            Buat Course Baru
          </Link>
        </Button>
      </header>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Phase 1 BETA</strong> — limit {PHASE1_FREE_MAX_COURSES} course
        aktif & 5 lesson per course. Plan upgrade dgn token unlock di Phase 3.
        Phase 1 hanya support video embed (YouTube/Vimeo) + teks; upload file
        masuk Phase 2.
      </div>

      <CoursesList courses={courses} />
    </div>
  )
}
