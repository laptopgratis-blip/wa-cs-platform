// DEPRECATED: signup pakai password sudah di-replace dengan OTP flow di
// POST /api/auth/otp/request {mode:'SIGNUP',...}. Endpoint ini di-disable
// supaya bot/legacy client tidak bisa bypass verifikasi WA+email.
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error:
        'Pendaftaran via password sudah ditutup. Daftar via /register (OTP email + WhatsApp).',
    },
    { status: 410 },
  )
}
