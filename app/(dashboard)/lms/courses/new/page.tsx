// /lms/courses/new — form bikin course baru.
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { CourseCreateForm } from '@/components/lms/CourseCreateForm'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
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
    <PageContainer width="narrow">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link href="/lms/courses">
            <ArrowLeft className="mr-2 size-4" />
            Kembali ke Course Saya
          </Link>
        </Button>
        <PageHeader
          title="Buat Course Baru"
          description="Course bisa di-link ke produk yang sudah ada — saat customer beli produk itu, akses course otomatis aktif."
        />
      </div>

      <CourseCreateForm availableProducts={products} />
    </PageContainer>
  )
}
