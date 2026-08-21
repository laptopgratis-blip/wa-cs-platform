// Halaman /bantuan — Bantuan & Dukungan untuk seller.
// Server component: nomor WA & email support dibaca langsung dari SiteSettings
// (tidak lewat endpoint publik) supaya tidak menambah permukaan serang.
import { LifeBuoy, Clock, Mail, MessageCircle, BookMarked, Compass, ShoppingBag } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { FaqList } from '@/components/support/FaqList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authOptions } from '@/lib/auth'
import { getSetting, SETTING_KEYS } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Bantuan & Dukungan · Hulao',
}

export default async function BantuanPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [waAdmin, supportEmail, supportHours, platformName] = await Promise.all([
    getSetting(SETTING_KEYS.WA_ADMIN),
    getSetting(SETTING_KEYS.SUPPORT_EMAIL),
    getSetting(SETTING_KEYS.SUPPORT_HOURS),
    getSetting(SETTING_KEYS.PLATFORM_NAME),
  ])

  const userName = session.user.name ?? '-'
  const userEmail = session.user.email ?? '-'

  // Prefill memuat identitas dari sesi (bukan input user) supaya admin tahu
  // siapa yang menghubungi tanpa harus bertanya balik.
  const waText = [
    `Halo Admin ${platformName}, saya butuh bantuan.`,
    '',
    `Nama: ${userName}`,
    `Email: ${userEmail}`,
    '',
    'Kendala saya: ',
  ].join('\n')
  const waUrl = `https://wa.me/${waAdmin}?text=${encodeURIComponent(waText)}`
  const mailUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(
    `[Bantuan] ${platformName} — ${userEmail}`,
  )}`

  const hasContact = Boolean(waAdmin || supportEmail)

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <PageHeader
        icon={LifeBuoy}
        title="Bantuan & Dukungan"
        description="Cari jawaban cepat di pertanyaan umum, atau hubungi tim kami langsung."
      />

      {hasContact ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {waAdmin && (
            <Card className="rounded-xl border-emerald-200 bg-emerald-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-emerald-900">
                  <MessageCircle className="size-4" /> Chat WhatsApp
                </CardTitle>
                <CardDescription className="text-emerald-900/70">
                  Cara tercepat. Pesanmu sudah terisi otomatis dengan data akun.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                  <a href={waUrl} target="_blank" rel="noopener noreferrer">
                    Chat Admin via WhatsApp
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}

          {supportEmail && (
            <Card className="rounded-xl border-warm-200">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="size-4 text-primary-500" /> Email Support
                </CardTitle>
                <CardDescription>
                  Cocok untuk kendala yang perlu lampiran atau penjelasan panjang.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button asChild variant="outline" className="w-full">
                  <a href={mailUrl}>{supportEmail}</a>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={LifeBuoy}
              title="Kontak support belum diatur"
              description="Admin platform belum mengisi nomor WhatsApp dan email support. Sementara ini, cek dulu pertanyaan umum di bawah."
            />
          </CardContent>
        </Card>
      )}

      {supportHours && (
        <p className="flex items-center gap-1.5 text-xs text-warm-500">
          <Clock className="size-3.5" /> Jam operasional: {supportHours}
        </p>
      )}

      <Card className="rounded-xl border-warm-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coba dulu sendiri</CardTitle>
          <CardDescription>
            Sebagian besar kendala sudah ada panduannya — biasanya lebih cepat daripada menunggu balasan.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <Button asChild variant="outline" className="justify-start">
            <Link href="/onboarding/guide">
              <Compass className="mr-2 size-4" /> Panduan awal
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link href="/dokumentasi">
              <BookMarked className="mr-2 size-4" /> Dokumentasi
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link href="/cara-jualan">
              <ShoppingBag className="mr-2 size-4" /> Cara Jualan
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 font-display text-lg font-bold text-warm-900 dark:text-warm-50">
          Pertanyaan Umum
        </h2>
        <FaqList />
      </div>
    </div>
  )
}
