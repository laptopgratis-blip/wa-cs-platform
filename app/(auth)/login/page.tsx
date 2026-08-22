// Halaman login. Server component — cek session, redirect kalau sudah login.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { LoginForm } from '@/components/auth/LoginForm'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { authOptions } from '@/lib/auth'
import { getOtpChannelMode } from '@/lib/settings'

export default async function LoginPage() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  )
  const otpChannelMode = await getOtpChannelMode()

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="font-display text-warm-900 text-2xl font-bold">
          Masuk
        </CardTitle>
        <CardDescription className="text-warm-500">
          Selamat datang kembali — masuk untuk lanjut ke dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm
          googleEnabled={googleEnabled}
          otpChannelMode={otpChannelMode}
        />
      </CardContent>
    </Card>
  )
}
