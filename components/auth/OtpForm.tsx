'use client'

// Reusable OTP verification form. Dipakai dari:
// - RegisterForm (mode SIGNUP, channel EMAIL)
// - LoginForm tab Email (mode LOGIN, channel EMAIL)
// - LoginForm tab WhatsApp (mode LOGIN, channel PHONE)
//
// Setelah user input 6-digit code, panggil signIn('otp', {otpId, code}).
// Errornya di-map dari OtpError.code (lihat lib/otp/auth-otp.ts) ke pesan
// Indonesian yang ramah.
//
// Resend: panggil ulang endpoint /api/auth/otp/request dgn payload sama
// (lewat callback onResend dari parent — parent yang punya data signup
// atau identifier). Cooldown 60s, UI countdown.
import { Loader2 } from 'lucide-react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface OtpRequestPayload {
  otpId: string
  sentTo: { email: string; phone: string | null }
  emailDelivered: boolean
  waDelivered: boolean
  cooldownSec: number
}

interface OtpFormProps {
  initial: OtpRequestPayload
  // Callback ke parent untuk minta OTP baru (resend). Return payload baru
  // supaya OtpForm bisa update otpId & cooldown.
  onResend: () => Promise<OtpRequestPayload>
  // Redirect setelah login berhasil.
  callbackUrl?: string
  // Tampilkan "ganti email/no WA" link kalau true.
  onBack?: () => void
}

const ERROR_MESSAGE: Record<string, string> = {
  INVALID_INPUT: 'Format kode tidak valid.',
  INVALID_CODE: 'Kode OTP salah.',
  EXPIRED: 'OTP sudah kedaluwarsa. Klik "Kirim ulang".',
  USED: 'OTP sudah dipakai. Klik "Kirim ulang".',
  TOO_MANY_ATTEMPTS: 'Terlalu banyak salah input. Klik "Kirim ulang".',
  NOT_FOUND: 'OTP tidak ditemukan. Coba kirim ulang.',
  ALREADY_REGISTERED:
    'Email/nomor WA sudah terdaftar. Coba login dari halaman /login.',
  SIGNUP_DATA_MISSING: 'Data pendaftaran tidak lengkap. Daftar ulang.',
  USER_MISSING: 'Akun tidak ditemukan. Daftar ulang.',
}

export function OtpForm({
  initial,
  onResend,
  callbackUrl = '/dashboard',
  onBack,
}: OtpFormProps) {
  const router = useRouter()
  const [payload, setPayload] = useState(initial)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(initial.cooldownSec)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) {
      toast.error('Kode OTP harus 6 digit angka')
      return
    }
    setSubmitting(true)
    try {
      const res = await signIn('otp', {
        otpId: payload.otpId,
        code,
        redirect: false,
        callbackUrl,
      })
      if (res?.error) {
        const msg = ERROR_MESSAGE[res.error] ?? 'Verifikasi gagal. Coba lagi.'
        toast.error(msg)
        // Reset code field kalau salah/expired supaya user input ulang.
        if (
          ['INVALID_CODE', 'EXPIRED', 'USED', 'TOO_MANY_ATTEMPTS'].includes(
            res.error,
          )
        ) {
          setCode('')
        }
        return
      }
      toast.success('Berhasil masuk')
      router.push(res?.url || callbackUrl)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return
    setResending(true)
    try {
      const next = await onResend()
      setPayload(next)
      setCode('')
      setCooldown(next.cooldownSec)
      toast.success('OTP baru dikirim')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal kirim ulang'
      toast.error(msg)
    } finally {
      setResending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="rounded-lg border border-warm-200 bg-warm-50/60 p-3 text-sm">
        <p className="text-warm-700">
          Kode OTP 6 digit dikirim ke{' '}
          {payload.emailDelivered && (
            <>
              email{' '}
              <strong className="text-warm-900">{payload.sentTo.email}</strong>
            </>
          )}
          {payload.emailDelivered && payload.waDelivered && ' dan '}
          {payload.waDelivered && payload.sentTo.phone && (
            <>
              WhatsApp{' '}
              <strong className="text-warm-900">{payload.sentTo.phone}</strong>
            </>
          )}
          .
        </p>
        {payload.sentTo.phone &&
          payload.emailDelivered &&
          !payload.waDelivered && (
            <p className="mt-2 text-xs text-amber-700">
              ⚠️ OTP via WhatsApp tidak terkirim (sesi pengirim sedang putus).
              Cek email kamu — kode tetap berlaku.
            </p>
          )}
        {!payload.emailDelivered && payload.waDelivered && (
          <p className="mt-2 text-xs text-amber-700">
            ⚠️ Email gagal terkirim. Cek WhatsApp untuk kode OTP.
          </p>
        )}
        <p className="mt-2 text-xs text-warm-500">
          Tidak masuk dalam 1 menit? Cek folder Spam email, atau klik &quot;Kirim
          ulang&quot;.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="otp">Kode OTP</Label>
        <Input
          id="otp"
          inputMode="numeric"
          pattern="\d{6}"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
          }
          className="tracking-[0.5em] text-center font-mono text-lg"
          autoFocus
        />
      </div>

      <Button
        type="submit"
        className="w-full bg-primary-500 font-semibold text-white shadow-orange hover:bg-primary-600"
        disabled={submitting || code.length !== 6}
      >
        {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
        Verifikasi
      </Button>

      <div className="flex items-center justify-between text-sm">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-warm-500 hover:text-warm-700"
          >
            ← Ganti email/no WA
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="font-medium text-primary-600 hover:underline disabled:cursor-not-allowed disabled:text-warm-400 disabled:no-underline"
        >
          {resending ? (
            <>
              <Loader2 className="mr-1 inline size-3 animate-spin" />
              Mengirim...
            </>
          ) : cooldown > 0 ? (
            `Kirim ulang (${cooldown}s)`
          ) : (
            'Kirim ulang'
          )}
        </button>
      </div>
    </form>
  )
}
