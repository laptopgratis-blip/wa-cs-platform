import { z } from 'zod'

// Batas ukuran file e-book. 50MB cukup untuk hampir semua PDF/EPUB; di atas
// itu upload buffer-di-RAM (pola upload eksisting) mulai berisiko.
export const EBOOK_MAX_BYTES = 50 * 1024 * 1024
// Limit jumlah e-book per user supaya disk VPS terkendali.
export const EBOOK_LIMIT_PER_USER = 50
// Batas pengaturan akses per e-book.
export const EBOOK_MAX_DOWNLOADS_LIMIT = 1000
export const EBOOK_ACCESS_DAYS_LIMIT = 3650 // 10 tahun

// Metadata file hasil /api/ebooks/upload — dikirim balik oleh client saat
// create/update Ebook. filePath divalidasi ulang server-side (prefix userId
// + assertSafeEbookRelPath + file exists).
const ebookFileMetaSchema = z.object({
  filePath: z.string().min(1),
  fileName: z.string().trim().min(1).max(200),
  fileFormat: z.enum(['PDF', 'EPUB']),
  fileSizeBytes: z
    .number()
    .int()
    .min(1)
    .max(EBOOK_MAX_BYTES),
  fileSha256: z.string().regex(/^[a-f0-9]{64}$/, 'Checksum tidak valid'),
})

export const ebookCreateSchema = z.object({
  title: z.string().trim().min(1, 'Judul wajib diisi').max(150),
  description: z.string().max(2000).nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  maxDownloads: z
    .number()
    .int()
    .min(1, 'Batas download minimal 1')
    .max(EBOOK_MAX_DOWNLOADS_LIMIT),
  // null = akses seumur hidup.
  accessDays: z
    .number()
    .int()
    .min(1)
    .max(EBOOK_ACCESS_DAYS_LIMIT)
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
  file: ebookFileMetaSchema,
})

// Update: semua field opsional; file baru (opsional) menggantikan yang lama
// (file lama dihapus dari disk setelah row ter-update).
export const ebookUpdateSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  description: z.string().max(2000).nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  maxDownloads: z
    .number()
    .int()
    .min(1)
    .max(EBOOK_MAX_DOWNLOADS_LIMIT)
    .optional(),
  accessDays: z
    .number()
    .int()
    .min(1)
    .max(EBOOK_ACCESS_DAYS_LIMIT)
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
  file: ebookFileMetaSchema.optional(),
})

export type EbookCreateInput = z.infer<typeof ebookCreateSchema>
export type EbookUpdateInput = z.infer<typeof ebookUpdateSchema>
