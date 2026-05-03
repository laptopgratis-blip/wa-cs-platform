// Schema validasi untuk POST /api/lp/generate.
import { z } from 'zod'

export const LP_STYLES = [
  { value: 'MODERN_MINIMALIS', label: 'Modern Minimalis' },
  { value: 'BOLD_COLORFUL', label: 'Bold & Colorful' },
  { value: 'ELEGAN_PREMIUM', label: 'Elegan Premium' },
  { value: 'CASUAL_FRIENDLY', label: 'Casual Friendly' },
] as const

export const LP_CTA_TYPES = [
  { value: 'WHATSAPP', label: 'Hubungi via WA' },
  { value: 'BUY', label: 'Beli Sekarang' },
  { value: 'SIGNUP', label: 'Daftar Gratis' },
  { value: 'LEARN_MORE', label: 'Pelajari Lebih Lanjut' },
] as const

export type LpStyle = (typeof LP_STYLES)[number]['value']
export type LpCtaType = (typeof LP_CTA_TYPES)[number]['value']

const styleValues = LP_STYLES.map((s) => s.value) as [LpStyle, ...LpStyle[]]
const ctaValues = LP_CTA_TYPES.map((c) => c.value) as [LpCtaType, ...LpCtaType[]]

export const lpGenerateSchema = z
  .object({
    lpId: z.string().min(1, 'lpId wajib diisi'),
    description: z
      .string()
      .trim()
      .min(20, 'Deskripsi minimal 20 karakter')
      .max(3000, 'Deskripsi maksimal 3000 karakter'),
    imageUrls: z.string().trim().max(5000).optional().default(''),
    style: z.enum(styleValues),
    ctaType: z.enum(ctaValues),
    waNumber: z
      .string()
      .trim()
      // Format internasional tanpa +. WA biasanya 10-15 digit (62 + 9-13 digit).
      .regex(/^\d{10,15}$/, 'Nomor WA harus 10-15 digit (mis. 6281234567890)')
      .optional()
      .or(z.literal('')),
  })
  .refine(
    (d) => {
      // Kalau CTA-nya WhatsApp, nomor WA wajib diisi.
      if (d.ctaType === 'WHATSAPP') return Boolean(d.waNumber)
      return true
    },
    {
      message: 'Nomor WA wajib diisi kalau CTA-nya "Hubungi via WA"',
      path: ['waNumber'],
    },
  )

export type LpGenerateInput = z.infer<typeof lpGenerateSchema>
