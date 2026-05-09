'use client'

import { Loader2, Mail, MessageCircle, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Step = 'phone' | 'otp'

export function LoginForm() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  // Magic-link via email — input muncul kalau backend return "email tidak ditemukan".
  const [showEmailInput, setShowEmailInput] = useState(false)
  const [email, setEmail] = useState('')
  const [magicLoading, setMagicLoading] = useState(false)

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) {
      toast.error('Nomor WA wajib diisi')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/lms/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.message || json.error || 'Gagal request OTP')
        return
      }
      setInfo(json.data?.message ?? 'OTP terkirim. Cek WhatsApp.')
      setStep('otp')
      toast.success('OTP dikirim')
    } finally {
      setSubmitting(false)
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault()
    if (otp.trim().length < 4) {
      toast.error('OTP wajib diisi')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/lms/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), otp: otp.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.message || json.error || 'OTP salah')
        return
      }
      toast.success('Login berhasil')
      router.refresh()
      setTimeout(() => {
        window.location.reload()
      }, 300)
    } finally {
      setSubmitting(false)
    }
  }

  async function sendMagicViaEmail() {
    if (!phone.trim()) {
      toast.error('Isi nomor WA dulu')
      return
    }
    setMagicLoading(true)
    try {
      const body: { phone: string; channel: 'EMAIL'; email?: string } = {
        phone: phone.trim(),
        channel: 'EMAIL',
      }
      if (email.trim()) body.email = email.trim()

      const res = await fetch('/api/lms/auth/magic/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        const msg = json.error || json.message || 'Gagal kirim email'
        // Trigger input email manual kalau backend bilang email belum diketahui.
        if (msg.toLowerCase().includes('email tidak ditemukan')) {
          setShowEmailInput(true)
          toast.error('Masukkan email yang dipakai saat order')
          return
        }
        toast.error(msg)
        return
      }
      toast.success(json.data?.message ?? 'Link login dikirim ke email')
      setInfo(json.data?.message ?? 'Cek email kamu — link login sudah dikirim.')
      setShowEmailInput(false)
    } finally {
      setMagicLoading(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        {step === 'phone' ? (
          <form className="space-y-4" onSubmit={requestOtp}>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Nomor WhatsApp</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="081234567890"
                autoFocus
              />
              <p className="text-[11px] text-warm-500">
                Pakai nomor yg sama dgn yg dipakai saat order course.
              </p>
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary-500 text-white hover:bg-primary-600"
            >
              {submitting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <MessageCircle className="mr-2 size-4" />
              )}
              Kirim OTP via WhatsApp
            </Button>

            <EmailMagicSection
              show={showEmailInput}
              email={email}
              onEmail={setEmail}
              loading={magicLoading}
              onSend={sendMagicViaEmail}
            />
          </form>
        ) : (
          <form className="space-y-4" onSubmit={verifyOtp}>
            {info && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                {info}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="otp">Kode OTP (6 digit)</Label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                autoFocus
                className="text-center font-mono text-2xl tracking-widest"
              />
              <p className="text-[11px] text-warm-500">
                Berlaku 5 menit. OTP dikirim ke WhatsApp {phone}.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep('phone')
                  setOtp('')
                  setInfo(null)
                }}
              >
                Ganti nomor
              </Button>
              <Button
                type="submit"
                disabled={submitting || otp.length < 4}
                className="flex-1 bg-primary-500 text-white hover:bg-primary-600"
              >
                {submitting ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 size-4" />
                )}
                Verifikasi &amp; Masuk
              </Button>
            </div>

            <EmailMagicSection
              show={showEmailInput}
              email={email}
              onEmail={setEmail}
              loading={magicLoading}
              onSend={sendMagicViaEmail}
            />
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function EmailMagicSection({
  show,
  email,
  onEmail,
  loading,
  onSend,
}: {
  show: boolean
  email: string
  onEmail: (v: string) => void
  loading: boolean
  onSend: () => void
}) {
  return (
    <div className="border-t border-warm-200 pt-4">
      <div className="mb-2 text-center text-[11px] uppercase tracking-wide text-warm-400">
        atau
      </div>
      {show && (
        <div className="mb-2 space-y-1.5">
          <Label htmlFor="email">Email saat order</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            placeholder="kamu@email.com"
          />
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={loading}
        onClick={onSend}
        className="w-full"
      >
        {loading ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Mail className="mr-2 size-4" />
        )}
        Kirim link login ke Email
      </Button>
      <p className="mt-1.5 text-[11px] text-warm-500">
        Klik link di email = langsung masuk, tanpa OTP. Cocok kalau WhatsApp
        sedang error.
      </p>
    </div>
  )
}
