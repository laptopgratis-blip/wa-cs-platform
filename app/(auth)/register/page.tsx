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
import { getOtpChannelMode } from '@/lib/settings'

export default async function RegisterPage() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  const otpChannelMode = await getOtpChannelMode()

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="font-display text-warm-900 text-2xl font-bold">
          Buat Akun
        </CardTitle>
        <CardDescription className="text-warm-500">
          Mulai pakai WA AI Customer Service — gratis sampai token habis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm otpChannelMode={otpChannelMode} />
      </CardContent>
    </Card>
  )
}
