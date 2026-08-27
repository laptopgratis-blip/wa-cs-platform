// Halaman /bantuan — Bantuan & Dukungan untuk seller.
// Server component: nomor WA & email support dibaca langsung dari SiteSettings
// (tidak lewat endpoint publik) supaya tidak menambah permukaan serang.
import {
  LifeBuoy,
  Clock,
  Mail,
  MessageCircle,
  BookMarked,
  Compass,
  ShoppingBag,
} from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/shared/EmptyState'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { FaqList } from '@/components/support/FaqList'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { authOptions } from '@/lib/auth'
import { getSetting, SETTING_KEYS } from '@/lib/settings'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Bantuan & Dukungan · Hulao',
}

export default async function BantuanPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [waAdmin, supportEmail, supportHours, platformName] = await Promise.all(
    [
      getSetting(SETTING_KEYS.WA_ADMIN),
      getSetting(SETTING_KEYS.SUPPORT_EMAIL),
      getSetting(SETTING_KEYS.SUPPORT_HOURS),
      getSetting(SETTING_KEYS.PLATFORM_NAME),
    ],
  )

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
    <PageContainer width="narrow">
      <PageHeader
        icon={LifeBuoy}
        title="Bantuan & Dukungan"
        description="Cari jawaban cepat di pertanyaan umum, atau hubungi tim kami langsung."
      />

      {hasContact ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Aksen kanal WhatsApp (hijau) lewat registry ui-tones, bukan class
              palet mentah — keputusan owner 2026-08-22. */}
          {waAdmin && (
            <Card className={TONES.whatsapp.bg}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageCircle
                    className={cn('size-4', TONES.whatsapp.text)}
                  />{' '}
                  Chat WhatsApp
                </CardTitle>
                <CardDescription>
                  Cara tercepat. Pesanmu sudah terisi otomatis dengan data akun.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className={cn('w-full', TONES.whatsapp.solid)}>
                  <a href={waUrl} target="_blank" rel="noopener noreferrer">
                    Chat Admin via WhatsApp
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}

          {supportEmail && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="text-primary-500 size-4" /> Email Support
                </CardTitle>
                <CardDescription>
                  Cocok untuk kendala yang perlu lampiran atau penjelasan
                  panjang.
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
        <EmptyState
          bordered
          icon={LifeBuoy}
          title="Kontak support belum diatur"
          description="Admin platform belum mengisi nomor WhatsApp dan email support. Sementara ini, cek dulu pertanyaan umum di bawah."
        />
      )}

      {supportHours && (
        <p className="text-warm-500 flex items-center gap-1.5 text-xs">
          <Clock className="size-3.5" /> Jam operasional: {supportHours}
        </p>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coba dulu sendiri</CardTitle>
          <CardDescription>
            Sebagian besar kendala sudah ada panduannya — biasanya lebih cepat
            daripada menunggu balasan.
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
        <h2 className="font-display text-warm-900 mb-3 text-xl font-semibold">
          Pertanyaan Umum
        </h2>
        <FaqList />
      </div>
    </PageContainer>
  )
}
