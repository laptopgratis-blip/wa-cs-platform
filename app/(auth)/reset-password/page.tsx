// Halaman reset password — pakai token dari query string.
// Suspense diperlukan karena ResetPasswordForm pakai useSearchParams (client hook).
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { authOptions } from '@/lib/auth'

export default async function ResetPasswordPage() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="font-display text-warm-900 text-2xl font-bold">
          Reset Password
        </CardTitle>
        <CardDescription className="text-warm-500">
          Buat password baru untuk akun kamu.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense
          fallback={<p className="text-muted-foreground text-sm">Memuat…</p>}
        >
          <ResetPasswordForm />
        </Suspense>
      </CardContent>
    </Card>
  )
}
