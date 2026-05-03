// Halaman pendaftaran akun baru.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { RegisterForm } from '@/components/auth/RegisterForm'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { authOptions } from '@/lib/auth'

export default async function RegisterPage() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  return (
    <Card className="rounded-xl border-warm-200 shadow-lg">
      <CardHeader className="space-y-1.5">
        <CardTitle className="font-display text-2xl font-extrabold text-warm-900 dark:text-warm-50">
          Buat Akun
        </CardTitle>
        <CardDescription className="text-warm-500">
          Mulai pakai WA AI Customer Service — gratis sampai token habis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
      </CardContent>
    </Card>
  )
}
