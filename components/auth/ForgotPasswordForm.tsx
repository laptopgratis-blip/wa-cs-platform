'use client'

// Form lupa password — kirim email reset.
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from '@/lib/validations/auth'

export function ForgotPasswordForm() {
  const [isSubmitting, setSubmitting] = useState(false)
  const [isSubmitted, setSubmitted] = useState(false)

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: ForgotPasswordInput) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; data?: { message: string }; error?: string }
        | null

      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Gagal mengirim link reset, coba lagi')
        return
      }

      toast.success(json.data?.message ?? 'Link reset sudah dikirim ke email kamu')
      setSubmitted(true)
    } catch (err) {
      console.error(err)
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSubmitting(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-warm-700">
          Jika email <span className="font-medium">{form.getValues('email')}</span>{' '}
          terdaftar, kami sudah mengirim link reset password ke inbox kamu. Link
          berlaku 15 menit.
        </p>
        <p className="text-sm text-muted-foreground">
          Tidak dapat email? Cek folder spam atau coba lagi beberapa menit lagi.
        </p>
        <Button variant="outline" className="w-full" onClick={() => setSubmitted(false)}>
          Kirim ulang
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Kembali ke halaman masuk
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="kamu@email.com"
          aria-invalid={Boolean(form.formState.errors.email)}
          {...form.register('email')}
        />
        {form.formState.errors.email && (
          <p className="text-sm text-destructive">
            {form.formState.errors.email.message}
          </p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full bg-primary-500 font-semibold text-white shadow-orange hover:bg-primary-600"
        disabled={isSubmitting}
      >
        {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
        Kirim Link Reset
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Sudah ingat password?{' '}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Masuk
        </Link>
      </p>
    </form>
  )
}
