'use client'

// Login form 3 mode:
// - Tab "Email" → OTP ke email (utama untuk semua user)
// - Tab "WhatsApp" → OTP ke email + WA (kalau user punya phoneNumber)
// - Tab "Password" → form lama email+password (untuk user existing)
// Tujuan: user OTP-only (baru) bisa masuk via Email/WA tab; user lama tetap
// punya akses pakai password.
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { OtpForm, type OtpRequestPayload } from '@/components/auth/OtpForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  loginSchema,
  phoneSchema,
  type LoginInput,
} from '@/lib/validations/auth'

interface LoginFormProps {
  googleEnabled: boolean
}

const emailIdentifierSchema = z.object({
  identifier: z
    .string({ message: 'Email wajib diisi' })
    .trim()
    .toLowerCase()
    .email('Format email tidak valid'),
})
const phoneIdentifierSchema = z.object({ identifier: phoneSchema })

type IdentifierInput = { identifier: string }

export function LoginForm({ googleEnabled }: LoginFormProps) {
  const router = useRouter()
  const params = useSearchParams()
  const callbackUrl = params.get('callbackUrl') || '/dashboard'

  const [otpPayload, setOtpPayload] = useState<OtpRequestPayload | null>(null)
  // Simpan request OTP terakhir supaya bisa di-resend tanpa user re-input.
  const [lastRequest, setLastRequest] = useState<{
    channel: 'EMAIL' | 'PHONE'
    identifier: string
  } | null>(null)

  async function requestOtp(channel: 'EMAIL' | 'PHONE', identifier: string) {
    const res = await fetch('/api/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'LOGIN', channel, identifier }),
    })
    const json = (await res.json().catch(() => null)) as
      | { success: boolean; data?: OtpRequestPayload; error?: string }
      | null
    if (!res.ok || !json?.success || !json.data) {
      throw new Error(json?.error ?? 'Gagal kirim OTP')
    }
    return json.data
  }

  if (otpPayload && lastRequest) {
    return (
      <OtpForm
        initial={otpPayload}
        callbackUrl={callbackUrl}
        onResend={() => requestOtp(lastRequest.channel, lastRequest.identifier)}
        onBack={() => {
          setOtpPayload(null)
          setLastRequest(null)
        }}
      />
    )
  }

  return (
    <Tabs defaultValue="email" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="email">Email</TabsTrigger>
        <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>

      {/* TAB EMAIL ─────────────────────────────────────────── */}
      <TabsContent value="email" className="mt-4">
        <IdentifierLoginForm
          schema={emailIdentifierSchema}
          inputProps={{
            type: 'email',
            autoComplete: 'email',
            placeholder: 'kamu@email.com',
            label: 'Email',
          }}
          hint="Kami kirim kode OTP ke email kamu (juga ke WhatsApp kalau terdaftar)."
          onSubmit={async ({ identifier }) => {
            const payload = await requestOtp('EMAIL', identifier)
            setLastRequest({ channel: 'EMAIL', identifier })
            setOtpPayload(payload)
          }}
        />
        {googleEnabled && (
          <GoogleSection callbackUrl={callbackUrl} className="mt-4" />
        )}
      </TabsContent>

      {/* TAB WHATSAPP ─────────────────────────────────────── */}
      <TabsContent value="whatsapp" className="mt-4">
        <IdentifierLoginForm
          schema={phoneIdentifierSchema}
          inputProps={{
            type: 'tel',
            autoComplete: 'tel',
            placeholder: '08123456789',
            label: 'Nomor WhatsApp',
          }}
          hint="OTP dikirim ke WhatsApp + email akun kamu."
          onSubmit={async ({ identifier }) => {
            const payload = await requestOtp('PHONE', identifier)
            setLastRequest({ channel: 'PHONE', identifier })
            setOtpPayload(payload)
          }}
        />
      </TabsContent>

      {/* TAB PASSWORD ─────────────────────────────────────── */}
      <TabsContent value="password" className="mt-4">
        <PasswordLoginForm callbackUrl={callbackUrl} router={router} />
        {googleEnabled && (
          <GoogleSection callbackUrl={callbackUrl} className="mt-4" />
        )}
      </TabsContent>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Belum punya akun?{' '}
        <Link href="/register" className="font-medium text-foreground hover:underline">
          Daftar
        </Link>
      </p>
    </Tabs>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub: form identifier (email atau phone) untuk minta OTP
// ─────────────────────────────────────────────────────────────
function IdentifierLoginForm({
  schema,
  inputProps,
  hint,
  onSubmit,
}: {
  // Cast Resolver di bawah karena Zod v4 + zodResolver type-inference
  // ribet kalau schema generic (output type bisa berbeda input untuk
  // schema dgn .transform). Untuk form ini cukup pakai IdentifierInput.
  schema: z.ZodTypeAny
  inputProps: {
    type: string
    autoComplete: string
    placeholder: string
    label: string
  }
  hint: string
  onSubmit: (v: IdentifierInput) => Promise<void>
}) {
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<IdentifierInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any) as Resolver<IdentifierInput>,
    defaultValues: { identifier: '' },
  })

  async function handle(values: IdentifierInput) {
    setSubmitting(true)
    try {
      await onSubmit(values)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal kirim OTP'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handle)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="identifier">{inputProps.label}</Label>
        <Input
          id="identifier"
          type={inputProps.type}
          autoComplete={inputProps.autoComplete}
          placeholder={inputProps.placeholder}
          aria-invalid={Boolean(form.formState.errors.identifier)}
          {...form.register('identifier')}
        />
        {form.formState.errors.identifier && (
          <p className="text-sm text-destructive">
            {form.formState.errors.identifier.message as string}
          </p>
        )}
        <p className="text-xs text-warm-500">{hint}</p>
      </div>
      <Button
        type="submit"
        className="w-full bg-primary-500 font-semibold text-white shadow-orange hover:bg-primary-600"
        disabled={submitting}
      >
        {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
        Kirim Kode OTP
      </Button>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub: form password (untuk user lama / Google)
// ─────────────────────────────────────────────────────────────
function PasswordLoginForm({
  callbackUrl,
  router,
}: {
  callbackUrl: string
  router: ReturnType<typeof useRouter>
}) {
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginInput) {
    setSubmitting(true)
    try {
      const res = await signIn('credentials', {
        email: values.email,
        password: values.password,
        redirect: false,
        callbackUrl,
      })
      if (res?.error) {
        toast.error('Email atau password salah')
        return
      }
      toast.success('Berhasil masuk')
      router.push(res?.url || callbackUrl)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
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
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-primary-600 hover:underline"
          >
            Lupa password?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          aria-invalid={Boolean(form.formState.errors.password)}
          {...form.register('password')}
        />
        {form.formState.errors.password && (
          <p className="text-sm text-destructive">
            {form.formState.errors.password.message}
          </p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full bg-primary-500 font-semibold text-white shadow-orange hover:bg-primary-600"
        disabled={submitting}
      >
        {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
        Masuk
      </Button>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub: tombol Google
// ─────────────────────────────────────────────────────────────
function GoogleSection({
  callbackUrl,
  className,
}: {
  callbackUrl: string
  className?: string
}) {
  const [loading, setLoading] = useState(false)
  async function handle() {
    setLoading(true)
    try {
      await signIn('google', { callbackUrl })
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className={className}>
      <div className="relative my-4">
        <Separator />
        <span className="absolute inset-0 -top-2.5 mx-auto flex w-fit bg-card px-2 text-xs uppercase text-muted-foreground">
          atau
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handle}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <GoogleIcon className="mr-2 size-4" />
        )}
        Masuk dengan Google
      </Button>
    </div>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.2 14.6 2.2 12 2.2 6.5 2.2 2 6.7 2 12.2s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z"
      />
    </svg>
  )
}
