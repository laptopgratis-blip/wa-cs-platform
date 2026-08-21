// Halaman /dokumentasi — pusat dokumentasi untuk seller.
// Sengaja BUKAN redirect ke DOCS_URL: saat situs dokumentasi eksternal belum
// ada (DOCS_URL kosong), menu harus tetap berguna, bukan mental ke halaman
// error. Kartu eksternal muncul hanya kalau admin sudah mengisi URL-nya.
import {
  BookMarked,
  Code2,
  Compass,
  ExternalLink,
  LifeBuoy,
  Plug,
  Presentation,
  ShoppingBag,
} from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authOptions } from '@/lib/auth'
import { getSetting, SETTING_KEYS } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Dokumentasi · Hulao',
}

const RESOURCES = [
  {
    icon: Presentation,
    title: 'WhatsApp API Resmi (Cloud API)',
    description:
      'Kenapa ada dua jalur WhatsApp, apa itu window 24 jam, template Meta, dan bagaimana biayanya dihitung.',
    href: '/presentasi-waba-hulao.html',
    external: true,
  },
  {
    icon: Code2,
    title: 'Dokumentasi API',
    description: 'Buat kunci API, autentikasi Bearer, daftar endpoint, kode error, dan batas pemakaian.',
    href: '/pengembang/api',
  },
  {
    icon: Plug,
    title: 'Script Embed & Tracking',
    description: 'Cara memasang widget Live AI dan LP Tracker di situsmu sendiri, plus otomasi via n8n/Zapier.',
    href: '/pengembang/integrasi',
  },
  {
    icon: Compass,
    title: 'Panduan Awal',
    description: 'Langkah demi langkah menyiapkan akun: sambungkan WhatsApp, atur Soul, sampai order pertama.',
    href: '/onboarding/guide',
  },
  {
    icon: ShoppingBag,
    title: 'Cara Jualan',
    description: 'Alur penjualan yang dipakai AI saat membalas customer — dari sapaan sampai closing.',
    href: '/cara-jualan',
  },
]

export default async function DokumentasiPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const docsUrl = (await getSetting(SETTING_KEYS.DOCS_URL)).trim()
  // Guard kedua (validasi utama ada di /admin/settings): hanya https yang
  // pernah dirender sebagai href.
  const externalDocs = docsUrl.startsWith('https://') ? docsUrl : ''

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <PageHeader
        icon={BookMarked}
        title="Dokumentasi"
        description="Panduan memakai Hulao — dari menyambungkan WhatsApp sampai menghubungkan sistem lain lewat API."
      />

      {externalDocs ? (
        <Card className="rounded-xl border-primary-200 bg-gradient-to-br from-primary-50 via-white to-primary-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Dokumentasi lengkap</CardTitle>
            <CardDescription>
              Panduan penuh beserta contoh kasus tersedia di situs dokumentasi terpisah.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="bg-primary-500 text-white hover:bg-primary-600">
              <a href={externalDocs} target="_blank" rel="noopener noreferrer">
                Buka Dokumentasi <ExternalLink className="ml-2 size-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-xl border-dashed border-warm-300 bg-warm-50/40">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-warm-800">
                Situs dokumentasi lengkap sedang disiapkan
              </p>
              <p className="text-xs text-warm-500">
                Sementara ini pakai sumber di bawah, atau tanya langsung ke tim kami.
              </p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link href="/bantuan">
                <LifeBuoy className="mr-2 size-4" /> Bantuan & Dukungan
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {RESOURCES.map((r) => {
          const Icon = r.icon
          const inner = (
            <CardContent className="flex h-full flex-col gap-1.5 p-4">
              <span className="flex items-center gap-2 text-sm font-semibold text-warm-900 dark:text-warm-50">
                <Icon className="size-4 text-primary-500" aria-hidden />
                {r.title}
                {r.external && <ExternalLink className="size-3 text-warm-400" aria-hidden />}
              </span>
              <span className="text-xs leading-relaxed text-warm-500">{r.description}</span>
            </CardContent>
          )
          return (
            <Card
              key={r.href}
              className="rounded-xl border-warm-200 transition-colors hover:border-primary-300"
            >
              {r.external ? (
                <a href={r.href} target="_blank" rel="noopener noreferrer" className="block h-full">
                  {inner}
                </a>
              ) : (
                <Link href={r.href} className="block h-full">
                  {inner}
                </Link>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
