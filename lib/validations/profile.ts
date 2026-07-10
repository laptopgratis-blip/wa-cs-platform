// Zod schema untuk halaman profil — dipakai bersama oleh client (form)
// dan server (API route handler).
import { z } from 'zod'

export const updateProfileSchema = z.object({
  name: z
    .string({ message: 'Nama wajib diisi' })
    .trim()
    .min(2, 'Nama minimal 2 karakter')
    .max(80, 'Nama maksimal 80 karakter'),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

// currentPassword optional di schema — WAJIB atau tidaknya diputuskan
// SERVER berdasarkan DB (user punya password atau belum), bukan client.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z
      .string({ message: 'Password baru wajib diisi' })
      .min(6, 'Password minimal 6 karakter')
      .max(100, 'Password maksimal 100 karakter'),
    confirmPassword: z
      .string({ message: 'Konfirmasi password wajib diisi' })
      .min(1, 'Konfirmasi password wajib diisi'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Konfirmasi password tidak cocok',
    path: ['confirmPassword'],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
