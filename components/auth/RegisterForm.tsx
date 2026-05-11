'use client'

// Daftar akun baru via OTP — wajib isi email + nomor WA. OTP dikirim ke
// kedua channel, user verifikasi salah satu untuk aktivasi akun. Tidak
// pakai password — user OTP-only.
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { OtpForm, type OtpRequestPayload } from '@/components/auth/OtpForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { phoneSchema } from '@/lib/validations/auth'

const signupFormSchema = z.object({
  name: z
    .string({ message: 'Nama wajib diisi' })
    .trim()
    .min(2, 'Nama minimal 2 karakter')
    .max(80, 'Nama maksimal 80 karakter'),
  email: z
    .string({ message: 'Email wajib diisi' })
    .trim()
    .toLowerCase()
    .email('Format email tidak valid'),
  phone: phoneSchema,
})

type SignupFormInput = z.input<typeof signupFormSchema>

export function RegisterForm() {
  const [submitting, setSubmitting] = useState(false)
  const [otpPayload, setOtpPayload] = useState<OtpRequestPayload | null>(null)
  // Simpan data signup terakhir supaya bisa di-resend tanpa user isi ulang.
  const [lastSignup, setLastSignup] = useState<{
    name: string
    email: string
    phone: string
  } | null>(null)

  const form = useForm<SignupFormInput>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: { name: '', email: '', phone: '' },
  })

  async function requestOtp(signup: {
    name: string
    email: string
    phone: string
  }): Promise<OtpRequestPayload> {
    const res = await fetch('/api/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'SIGNUP', channel: 'EMAIL', signup }),
    })
    const json = (await res.json().catch(() => null)) as
      | { success: boolean; data?: OtpRequestPayload; error?: string }
      | null
    if (!res.ok || !json?.success || !json.data) {
      throw new Error(json?.error ?? 'Gagal kirim OTP')
    }
    return json.data
  }

  async function onSubmit(values: SignupFormInput) {
    setSubmitting(true)
    try {
      // Re-parse via Zod schema biar phone ter-normalize ke +62…
      const parsed = signupFormSchema.parse(values)
      const payload = await requestOtp(parsed)
      setLastSignup(parsed)
      setOtpPayload(payload)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Pendaftaran gagal'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (otpPayload && lastSignup) {
    return (
      <OtpForm
        initial={otpPayload}
        onResend={() => requestOtp(lastSignup)}
        onBack={() => {
          setOtpPayload(null)
        }}
        callbackUrl="/onboarding"
      />
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="name">Nama</Label>
        <Input
          id="name"
          autoComplete="name"
          placeholder="Nama lengkap"
          aria-invalid={Boolean(form.formState.errors.name)}
          {...form.register('name')}
        />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

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
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Nomor WhatsApp</Label>
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          placeholder="08123456789"
          aria-invalid={Boolean(form.formState.errors.phone)}
          {...form.register('phone')}
        />
        {form.formState.errors.phone && (
          <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
        )}
        <p className="text-xs text-warm-500">
          Kami kirim OTP verifikasi ke email + WhatsApp. Pastikan keduanya aktif.
        </p>
      </div>

      <Button
        type="submit"
        className="w-full bg-primary-500 font-semibold text-white shadow-orange hover:bg-primary-600"
        disabled={submitting}
      >
        {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
        Daftar &amp; Kirim OTP
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Sudah punya akun?{' '}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Masuk
        </Link>
      </p>
    </form>
  )
}
