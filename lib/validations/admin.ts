// Schema validasi untuk endpoint admin.
import { z } from 'zod'

export const aiModelCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  provider: z.enum(['ANTHROPIC', 'OPENAI', 'GOOGLE']),
  modelId: z.string().trim().min(2).max(120),
  costMode: z.enum(['AUTO', 'MANUAL']).optional(),
  costPerMessage: z.number().int().positive().max(100_000),
  inputPricePer1M: z.number().nonnegative().max(10_000).optional(),
  outputPricePer1M: z.number().nonnegative().max(10_000).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
})
export const aiModelUpdateSchema = aiModelCreateSchema.partial()
export type AiModelCreateInput = z.infer<typeof aiModelCreateSchema>

export const tokenPackageCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  tokenAmount: z.number().int().positive().max(10_000_000),
  price: z.number().int().positive().max(100_000_000),
  isPopular: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
})
export const tokenPackageUpdateSchema = tokenPackageCreateSchema.partial()
export type TokenPackageCreateInput = z.infer<typeof tokenPackageCreateSchema>

export const userTopupSchema = z.object({
  amount: z.number().int().positive().max(10_000_000),
  description: z.string().max(200).optional(),
})

// Edit user dari /admin/users. Semua field opsional — admin boleh ubah
// hanya satu hal sekaligus. tokenBalance = saldo absolut (override), bukan
// delta — beda dari topup yang increment. Pakai role enum yang sengaja
// dibatasi USER/ADMIN (FINANCE diset lewat path lain supaya tidak nyasar).
export const userUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Nama tidak boleh kosong').max(80).nullable().optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  tokenBalance: z.number().int().min(0).max(100_000_000).optional(),
})
export type UserUpdateInput = z.infer<typeof userUpdateSchema>

export const bankAccountCreateSchema = z.object({
  bankName: z.string().trim().min(2, 'Nama bank minimal 2 karakter').max(60),
  accountNumber: z
    .string()
    .trim()
    .min(5, 'Nomor rekening minimal 5 karakter')
    .max(40),
  accountName: z.string().trim().min(2, 'Nama pemilik minimal 2 karakter').max(80),
  isActive: z.boolean().optional(),
})
export const bankAccountUpdateSchema = bankAccountCreateSchema.partial()
export type BankAccountCreateInput = z.infer<typeof bankAccountCreateSchema>

export const manualPaymentRejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Alasan penolakan minimal 3 karakter')
    .max(500, 'Alasan maksimal 500 karakter'),
})
export type ManualPaymentRejectInput = z.infer<typeof manualPaymentRejectSchema>

// Soul settings — kepribadian & gaya balas yang dikurasi admin.
// systemPromptSnippet besar karena bisa berisi instruksi panjang (mis. teknik
// SPIN selling). Limit 8000 char selaras dengan businessContext Soul.
export const soulOptionCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(80),
  description: z.string().trim().min(2, 'Deskripsi minimal 2 karakter').max(300),
  systemPromptSnippet: z
    .string()
    .trim()
    .min(10, 'Instruksi AI minimal 10 karakter')
    .max(8000, 'Instruksi AI maksimal 8000 karakter'),
  isActive: z.boolean().optional(),
  order: z.number().int().min(0).max(1000).optional(),
})
export const soulOptionUpdateSchema = soulOptionCreateSchema.partial()
export type SoulOptionCreateInput = z.infer<typeof soulOptionCreateSchema>

export const lpUpgradePackageCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(80),
  description: z.string().trim().max(300).nullable().optional(),
  tier: z.enum(['STARTER', 'POPULAR', 'POWER']),
  maxLp: z.number().int().positive().max(9999),
  maxStorageMB: z.number().int().positive().max(100_000),
  price: z.number().int().positive().max(100_000_000),
  isPopular: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
})
export const lpUpgradePackageUpdateSchema = lpUpgradePackageCreateSchema.partial()
export type LpUpgradePackageCreateInput = z.infer<typeof lpUpgradePackageCreateSchema>

// Soul Testing Lab — request body untuk start simulation. totalRounds dibatasi
// max 30 supaya biaya aman (1 ronde ≈ Rp 50-200 tergantung model). Per-agen
// pakai SoulPersonality + SoulStyle (sumber data: Soul Settings) — bukan Soul.
export const soulSimulationCreateSchema = z.object({
  sellerPersonalityId: z.string().min(1, 'Kepribadian penjual wajib dipilih'),
  sellerStyleId: z.string().min(1, 'Gaya balas penjual wajib dipilih'),
  sellerModelId: z.string().min(1, 'Model penjual wajib dipilih'),
  sellerContext: z.string().trim().min(10, 'Konteks bisnis minimal 10 karakter').max(8000),
  buyerPersonalityId: z.string().min(1, 'Kepribadian pembeli wajib dipilih'),
  buyerStyleId: z.string().min(1, 'Gaya balas pembeli wajib dipilih'),
  buyerModelId: z.string().min(1, 'Model pembeli wajib dipilih'),
  buyerScenario: z.string().trim().min(10, 'Skenario pembeli minimal 10 karakter').max(8000),
  totalRounds: z.number().int().min(2, 'Minimal 2 ronde').max(30, 'Maksimal 30 ronde'),
  starterRole: z.enum(['SELLER', 'BUYER']),
  starterMessage: z.string().trim().min(2, 'Pesan pembuka minimal 2 karakter').max(2000),
})
export type SoulSimulationCreateInput = z.infer<typeof soulSimulationCreateSchema>

export const soulSimulationPresetCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(80),
  description: z.string().trim().max(300).nullable().optional(),
  config: soulSimulationCreateSchema, // simpan setup utuh
})
export type SoulSimulationPresetCreateInput = z.infer<typeof soulSimulationPresetCreateSchema>
