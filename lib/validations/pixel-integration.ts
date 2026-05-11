import { z } from 'zod'

export const PIXEL_INTEGRATION_LIMIT_PER_USER = 10

export const PIXEL_PLATFORMS = [
  'META',
  'GOOGLE_ADS',
  'GA4',
  'TIKTOK',
] as const
export type PixelPlatform = (typeof PIXEL_PLATFORMS)[number]

// Format pixelId per platform — diatur lewat regex untuk kasih hint kalau
// user salah copy. Tidak strict enough untuk reject 100%, tapi cukup untuk
// catch typo umum.
const PIXEL_ID_PATTERN: Record<PixelPlatform, RegExp> = {
  META: /^\d{10,20}$/,
  GA4: /^G-[A-Z0-9]{6,12}$/,
  GOOGLE_ADS: /^AW-\d{6,15}$/,
  TIKTOK: /^[A-Z0-9]{10,30}$/,
}

export const PIXEL_PLATFORM_LABELS: Record<PixelPlatform, string> = {
  META: 'Meta (Facebook/Instagram)',
  GOOGLE_ADS: 'Google Ads',
  GA4: 'Google Analytics 4',
  TIKTOK: 'TikTok',
}

export const PIXEL_PLATFORM_HELPER: Record<
  PixelPlatform,
  { pixelIdLabel: string; pixelIdHelp: string; tokenHelp?: string }
> = {
  META: {
    pixelIdLabel: 'Meta Pixel ID',
    pixelIdHelp:
      'Cari di Meta Events Manager → Data Sources → Pixel kamu. Format: 15-16 digit angka.',
    tokenHelp:
      'Buat di Meta Events Manager → Settings → Generate Access Token. Aktifkan Server-side untuk akurasi tracking maksimal.',
  },
  GOOGLE_ADS: {
    pixelIdLabel: 'Conversion ID',
    pixelIdHelp:
      'Cari di Google Ads → Tools → Conversions. Format: AW-1234567890.',
    tokenHelp: 'API Secret untuk server-side via Measurement Protocol.',
  },
  GA4: {
    pixelIdLabel: 'GA4 Measurement ID',
    pixelIdHelp:
      'Cari di GA4 Property → Data Streams → Measurement ID. Format: G-XXXXXXXXXX.',
    tokenHelp: 'API Secret di Data Stream → Measurement Protocol API secrets.',
  },
  TIKTOK: {
    pixelIdLabel: 'TikTok Pixel ID',
    pixelIdHelp:
      'Cari di TikTok Ads Manager → Assets → Events → Pixel kamu. Format: huruf besar + angka.',
    tokenHelp:
      'Access Token untuk Events API — buat di TikTok Events Manager → Settings.',
  },
}

const baseSchema = z.object({
  platform: z.enum(PIXEL_PLATFORMS),
  displayName: z.string().min(1, 'Nama wajib diisi').max(80),
  pixelId: z.string().min(3, 'Pixel ID terlalu pendek').max(60),
  serverSideEnabled: z.boolean().default(false),
  // Saat update, accessToken === '' artinya HAPUS / pertahankan existing? Kita
  // pakai konvensi: undefined = tidak diubah, null = hapus, string = set baru.
  // Max 2000 — Meta system user / app tokens bisa cukup panjang; 2000 safe.
  accessToken: z.string().min(1).max(2000).nullable().optional(),
  conversionLabelInitiateCheckout: z.string().max(50).nullable().optional(),
  conversionLabelLead: z.string().max(50).nullable().optional(),
  conversionLabelPurchase: z.string().max(50).nullable().optional(),
  testEventCode: z.string().max(50).nullable().optional(),
  isTestMode: z.boolean().default(false),
  // Purchase trigger granularity — default: cuma AdminMarkPaid yang true.
  triggerOnBuyerProofUpload: z.boolean().default(false),
  triggerOnAdminProofUpload: z.boolean().default(false),
  triggerOnAdminMarkPaid: z.boolean().default(true),
  isActive: z.boolean().default(true),
})

export const pixelIntegrationCreateSchema = baseSchema
  .refine(
    (v) => {
      const pattern = PIXEL_ID_PATTERN[v.platform]
      return pattern.test(v.pixelId.trim())
    },
    {
      message:
        'Format Pixel ID tidak sesuai platform. Cek tooltip di atas field.',
      path: ['pixelId'],
    },
  )
  .refine(
    (v) => {
      // Server-side enabled butuh accessToken.
      if (v.serverSideEnabled && !v.accessToken) return false
      return true
    },
    {
      message: 'Aktifkan server-side butuh access token',
      path: ['accessToken'],
    },
  )

// Update schema: relax — masing-masing field bisa di-patch sendiri-sendiri.
export const pixelIntegrationUpdateSchema = baseSchema.partial()

export type PixelIntegrationCreateInput = z.infer<
  typeof pixelIntegrationCreateSchema
>
export type PixelIntegrationUpdateInput = z.infer<
  typeof pixelIntegrationUpdateSchema
>
