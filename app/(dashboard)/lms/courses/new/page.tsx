// /lms/courses/new — form bikin course baru.
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { CourseCreateForm } from '@/components/lms/CourseCreateForm'
import { Button } from '@/components/ui/button'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function NewCoursePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // Pre-fetch produk yg belum punya course supaya UI tidak loading.
  const products = await prisma.product.findMany({
    where: {
      userId: session.user.id,
      isActive: true,
      courseId: null,
    },
    select: { id: true, name: true, price: true },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
  })

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link href="/lms/courses">
            <ArrowLeft className="mr-2 size-4" />
            Kembali ke Course Saya
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Buat Course Baru
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Course bisa di-link ke produk yang sudah ada — saat customer beli
          produk itu, akses course otomatis aktif.
        </p>
      </div>

      <CourseCreateForm availableProducts={products} />
    </div>
  )
}
