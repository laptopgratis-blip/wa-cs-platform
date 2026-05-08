// Schema validasi untuk endpoint landing page builder.
import { z } from 'zod'

// Slug: huruf kecil, angka, dan strip. Tidak boleh diawali/diakhiri strip.
export const slugSchema = z
  .string()
  .trim()
  .min(3, 'Slug minimal 3 karakter')
  .max(50, 'Slug maksimal 50 karakter')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug hanya boleh huruf kecil, angka, dan strip (mis. promo-akhir-tahun)',
  )

export const lpCreateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Judul minimal 2 karakter')
    .max(120, 'Judul maksimal 120 karakter'),
  slug: slugSchema,
})
export type LpCreateInput = z.infer<typeof lpCreateSchema>

export const lpUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    slug: slugSchema.optional(),
    // Limit 10 MB (~10 juta karakter). Cukup untuk LP yang detail dengan
    // beberapa image base64 inline. Lebih dari ini biasanya artinya HTML
    // tidak optimal — image harus di-upload sebagai file, bukan base64.
    htmlContent: z
      .string()
      .max(10_000_000, 'HTML terlalu besar (>10 MB). Coba upload image sebagai file daripada base64 inline.')
      .optional(),
    metaTitle: z.string().trim().max(160).nullable().optional(),
    metaDesc: z.string().trim().max(320).nullable().optional(),
    isPublished: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Tidak ada field yang diupdate',
  })
export type LpUpdateInput = z.infer<typeof lpUpdateSchema>
