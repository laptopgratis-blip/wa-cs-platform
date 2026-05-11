// Zod schema untuk form auth — dipakai bersama oleh client (RHF resolver)
// dan server (API route handler).
import { z } from 'zod'

import { normalizePhone } from '@/lib/phone'

export const registerSchema = z.object({
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
  password: z
    .string({ message: 'Password wajib diisi' })
    .min(6, 'Password minimal 6 karakter')
    .max(100, 'Password maksimal 100 karakter'),
})

export type RegisterInput = z.infer<typeof registerSchema>

export const loginSchema = z.object({
  email: z
    .string({ message: 'Email wajib diisi' })
    .trim()
    .toLowerCase()
    .email('Format email tidak valid'),
  password: z.string({ message: 'Password wajib diisi' }).min(1, 'Password wajib diisi'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const forgotPasswordSchema = z.object({
  email: z
    .string({ message: 'Email wajib diisi' })
    .trim()
    .toLowerCase()
    .email('Format email tidak valid'),
})

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    token: z.string({ message: 'Token wajib diisi' }).min(1, 'Token wajib diisi'),
    password: z
      .string({ message: 'Password wajib diisi' })
      .min(6, 'Password minimal 6 karakter')
      .max(100, 'Password maksimal 100 karakter'),
    confirmPassword: z
      .string({ message: 'Konfirmasi password wajib diisi' })
      .min(1, 'Konfirmasi password wajib diisi'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Konfirmasi password tidak cocok',
    path: ['confirmPassword'],
  })

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

// Nomor WA Indonesia — transform ke E.164 (+628…). Reject kalau format
// invalid (bukan mobile Indonesia 8xx).
export const phoneSchema = z
  .string({ message: 'Nomor WhatsApp wajib diisi' })
  .trim()
  .transform((v, ctx) => {
    const normalized = normalizePhone(v)
    if (!normalized) {
      ctx.addIssue({
        code: 'custom',
        message: 'Format nomor WA tidak valid (contoh: 08123456789)',
      })
      return z.NEVER
    }
    return normalized
  })

// Request OTP — SIGNUP: butuh data lengkap; LOGIN: butuh identifier.
export const otpRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('SIGNUP'),
    channel: z.enum(['EMAIL', 'PHONE']),
    signup: z.object({
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
    }),
  }),
  z.object({
    mode: z.literal('LOGIN'),
    channel: z.enum(['EMAIL', 'PHONE']),
    identifier: z
      .string({ message: 'Email atau nomor WA wajib diisi' })
      .trim()
      .min(1, 'Email atau nomor WA wajib diisi'),
  }),
])

export type OtpRequestInput = z.infer<typeof otpRequestSchema>

// Verify OTP — dipakai client kirim ke signIn('otp', ...).
export const otpVerifySchema = z.object({
  otpId: z.string().min(1),
  code: z
    .string({ message: 'Kode OTP wajib diisi' })
    .trim()
    .regex(/^\d{6}$/, 'Kode OTP harus 6 digit angka'),
})

export type OtpVerifyInput = z.infer<typeof otpVerifySchema>
