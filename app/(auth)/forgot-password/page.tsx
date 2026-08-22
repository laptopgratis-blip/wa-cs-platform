// Halaman lupa password — minta email lalu kirim link reset.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { authOptions } from '@/lib/auth'

export default async function ForgotPasswordPage() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="font-display text-warm-900 text-2xl font-bold">
          Lupa Password
        </CardTitle>
        <CardDescription className="text-warm-500">
          Masukkan email akun kamu — kami kirim link untuk membuat password
          baru.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  )
}
