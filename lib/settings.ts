// Helper untuk SiteSettings — key-value store fleksibel.
// Key di-define sebagai konstanta supaya ada single source of truth & autocomplete.
import { prisma } from '@/lib/prisma'

export const SETTING_KEYS = {
  WA_ADMIN: 'WA_ADMIN',
  PLATFORM_NAME: 'PLATFORM_NAME',
  SUPPORT_EMAIL: 'SUPPORT_EMAIL',
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

// Default platform name kalau belum di-set di DB.
const DEFAULTS: Record<SettingKey, string> = {
  WA_ADMIN: '',
  PLATFORM_NAME: 'Hulao',
  SUPPORT_EMAIL: '',
}

export async function getSetting(key: SettingKey): Promise<string> {
  const row = await prisma.siteSettings.findUnique({ where: { key } })
  return row?.value ?? DEFAULTS[key]
}

export async function getAllSettings(): Promise<Record<SettingKey, string>> {
  const rows = await prisma.siteSettings.findMany()
  const result: Record<string, string> = { ...DEFAULTS }
  for (const r of rows) {
    if (r.key in DEFAULTS) result[r.key] = r.value
  }
  return result as Record<SettingKey, string>
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await prisma.siteSettings.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}
