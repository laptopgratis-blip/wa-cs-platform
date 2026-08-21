// Halaman /pengembang/integrasi — rumah untuk aset developer-facing yang
// selama ini dipakai seller tapi tidak terdokumentasi di mana pun:
// public/lp-tracker.js dan public/hulao-live-embed.js.
//
// Halaman ini TIDAK di-gate paket; yang di-gate hanya tautan ke fitur POWER
// (Pixel Tracking & Auto Confirm) supaya user non-POWER tidak mendarat di
// layar UpgradeRequired tanpa konteks.
import {
  ArrowUpRight,
  BarChart3,
  Bot,
  Lock,
  Plug,
  Radio,
  Webhook,
  Workflow,
} from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { publicBaseUrl } from '@/lib/review-token'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Integrasi · Hulao',
}

function Snippet({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-warm-900 p-3 text-xs leading-relaxed text-warm-50 dark:bg-warm-950">
      <code>{children}</code>
    </pre>
  )
}

export default async function PengembangIntegrasiPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  const baseUrl = publicBaseUrl()

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <PageHeader
        icon={Plug}
        title="Integrasi"
        description="Script pelacak & host AI di landing page, plus cara menyambungkan Hulao ke tool otomasi."
      />

      <Card className="rounded-xl border-warm-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4 text-primary-500" /> LP Tracker
          </CardTitle>
          <CardDescription>
            Merekam perilaku pengunjung landing page: pageview, scroll 25/50/75/100%, lama tinggal,
            klik CTA, klik keluar, submit form, dan peta panas klik. Data dikirim berkelompok tiap 5
            detik dan sisanya diselamatkan saat halaman ditutup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-warm-600 dark:text-warm-300">
            <strong>Tidak perlu dipasang manual.</strong> Script ini otomatis disisipkan ke setiap
            landing page Hulao yang sudah dipublikasikan (alamat{' '}
            <code className="font-mono text-xs">{baseUrl}/p/slug-kamu</code>).
          </p>
          <p className="text-sm text-warm-600 dark:text-warm-300">
            <strong>Yang perlu kamu lakukan</strong> hanya satu: tambahkan atribut{' '}
            <code className="font-mono text-xs">data-lp-cta=&quot;nama-tombol&quot;</code>{' '}
            pada tombol penting di HTML landing page-mu.
          </p>
          <Snippet>{`<a href="/checkout" data-lp-cta="checkout-atas">Pesan Sekarang</a>`}</Snippet>
          <p className="text-sm text-warm-600 dark:text-warm-300">
            Ini bukan sekadar soal label. Yang otomatis masuk laporan CTA tanpa atribut hanyalah
            elemen <code className="font-mono text-xs">&lt;button&gt;</code> dan tautan ke{' '}
            <code className="font-mono text-xs">wa.me</code>,{' '}
            <code className="font-mono text-xs">tel:</code>, atau anchor{' '}
            <code className="font-mono text-xs">#bagian</code>. Tautan{' '}
            <code className="font-mono text-xs">mailto:</code> dan tautan ke domain luar tercatat
            sebagai klik keluar — bukan CTA. Tautan ke halaman sendiri seperti contoh di atas{' '}
            <strong>tidak masuk laporan CTA sama sekali</strong> tanpa{' '}
            <code className="font-mono text-xs">data-lp-cta</code>; kliknya hanya tercatat di peta
            panas. Jadi pasang atribut itu di tombol mana pun yang ingin kamu ukur.
          </p>
          <p className="text-xs text-warm-500">
            Isi field input tidak pernah direkam, dan IP pengunjung di-hash di server. Script aman
            kalau tidak sengaja terpasang dua kali — perekaman tetap sekali. Catatan: tracker
            mengirim data ke alamat yang sama dengan halamannya, jadi menempelkannya di situs milik
            sendiri (domain lain) belum didukung.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-warm-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="size-4 text-primary-500" /> Live AI Embed
          </CardTitle>
          <CardDescription>
            Menempelkan host AI Hulao ke landing page. Di LP Hulao script ini sudah otomatis
            terpasang begitu Live Embed diaktifkan; potongan di bawah untuk landing page yang kamu
            hosting sendiri di domain lain.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Snippet>{`<div data-hulao-live-embed></div>
<script src="${baseUrl}/hulao-live-embed.js"
        data-lp-id="LP_ID"
        data-base-url="${baseUrl}"></script>`}</Snippet>
          <p className="text-sm text-warm-600 dark:text-warm-300">
            Hanya <code className="font-mono text-xs">data-lp-id</code> yang wajib. Sisanya —
            posisi (menyatu atau mengambang di salah satu pojok), label tombol, dan pengaturan form
            lead — diambil script dari pengaturan Live Embed di halaman landing page terkait, jadi
            bisa diubah tanpa menyentuh kode di situsmu lagi.
          </p>
          <p className="text-xs text-warm-500">
            Setelan ukuran hanya berlaku untuk mode menyatu. Mode mengambang selalu 360×600 piksel
            (menyusut sendiri di layar kecil), berapa pun ukuran yang disetel.
          </p>
          <p className="text-xs text-warm-500">
            Penanda <code className="font-mono">&lt;div data-hulao-live-embed&gt;</code> menentukan
            posisi widget saat mode menyatu dipilih. Untuk mode mengambang penanda itu tidak
            diperlukan; tanpa penanda dan mode menyatu, widget dipasang di akhir halaman.
          </p>
          <p className="text-sm text-warm-600 dark:text-warm-300">
            <strong>Bonus:</strong> saat ada lead masuk, script otomatis memicu event konversi ke
            Meta Pixel, Google Analytics, dan TikTok Pixel yang sudah terpasang di halamanmu — tanpa
            kode tambahan.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-warm-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Workflow className="size-4 text-primary-500" /> Pakai kunci API dari n8n, Zapier, Make
          </CardTitle>
          <CardDescription>
            Ketiganya cukup memakai HTTP request biasa dengan satu header. Buat kuncinya dulu di
            halaman API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2 text-sm text-warm-600 dark:text-warm-300">
            <li>
              <strong>n8n</strong> — node <em>HTTP Request</em> → Authentication:{' '}
              <em>Generic Credential</em> → <em>Header Auth</em>. Nama:{' '}
              <code className="font-mono text-xs">Authorization</code>, Nilai:{' '}
              <code className="font-mono text-xs">Bearer hl_live_…</code>
            </li>
            <li>
              <strong>Zapier</strong> — aksi <em>Webhooks by Zapier</em> → <em>Custom Request</em>,
              isi Headers dengan pasangan yang sama.
            </li>
            <li>
              <strong>Make</strong> — modul <em>HTTP → Make a request</em>, tambahkan header yang
              sama.
            </li>
          </ul>
          <p className="text-xs text-warm-500">
            Simpan kunci di credential store masing-masing tool. Jangan menempelkannya di URL —
            URL tercatat di log dan riwayat.
          </p>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/pengembang/api">
              Buka halaman API <ArrowUpRight className="ml-2 size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="rounded-xl border-warm-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="size-4 text-primary-500" /> Pixel Tracking
            </CardTitle>
            <CardDescription>
              Kirim event pesanan ke Meta, Google, dan TikTok Ads dari sisi server.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {access.hasAccess ? (
              <Button asChild variant="outline" className="w-full">
                <Link href="/integrations/pixels">Atur Pixel</Link>
              </Button>
            ) : (
              <Button asChild variant="outline" className="w-full">
                <Link href="/pricing">
                  <Lock className="mr-2 size-4" /> Tersedia di paket POWER
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border-warm-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plug className="size-4 text-primary-500" /> Auto Confirm Bank
            </CardTitle>
            <CardDescription>
              Cocokkan mutasi rekening dengan pesanan supaya konfirmasi transfer jalan sendiri.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {access.hasAccess ? (
              <Button asChild variant="outline" className="w-full">
                <Link href="/integrations/bank-mutation">Atur Auto Confirm</Link>
              </Button>
            ) : (
              <Button asChild variant="outline" className="w-full">
                <Link href="/pricing">
                  <Lock className="mr-2 size-4" /> Tersedia di paket POWER
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border-2 border-dashed border-warm-300 bg-transparent dark:border-warm-700">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-warm-600 dark:text-warm-300">
            <Webhook className="size-4" /> Webhook keluar — segera hadir
          </CardTitle>
          <CardDescription>
            Nanti pesan masuk dan perubahan status pesan bisa dikirim otomatis ke URL milikmu,
            bertanda tangan HMAC supaya keasliannya bisa diverifikasi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="ghost" className="px-0 text-primary-600 hover:bg-transparent">
            <Link href="/bantuan">
              Butuh ini lebih cepat? Kabari kami <ArrowUpRight className="ml-1 size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
