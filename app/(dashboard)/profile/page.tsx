// /profile — halaman profil user: info akun, edit nama, ganti password.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { PasswordCard } from '@/components/profile/PasswordCard'
import { ProfileInfoCard } from '@/components/profile/ProfileInfoCard'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      phoneNumber: true,
      emailVerified: true,
      phoneVerified: true,
      createdAt: true,
      password: true,
    },
  })

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl p-4 md:p-6">
        <p className="text-sm text-muted-foreground">Akun tidak ditemukan.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 overflow-y-auto p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Profil Saya</h1>
        <p className="text-sm text-muted-foreground">
          Kelola informasi akun dan keamanan login kamu.
        </p>
      </div>
      <ProfileInfoCard
        initialName={user.name ?? ''}
        email={user.email}
        image={user.image}
        phoneNumber={user.phoneNumber}
        emailVerified={Boolean(user.emailVerified)}
        phoneVerified={Boolean(user.phoneVerified)}
        // Diformat di server supaya SSR & client render teks identik
        // (hindari hydration mismatch karena beda timezone).
        memberSinceLabel={user.createdAt.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      />
      <PasswordCard initialHasPassword={Boolean(user.password)} email={user.email} />
    </div>
  )
}
