// Halaman /pengembang/integrasi — "Script & Embed" (2026-08-26: webhook dipisah
// ke /pengembang/webhook; Pixel & Auto Confirm jadi item menu sendiri). Sisa di
// sini = dokumentasi script yang dipasang di landing page: LP Tracker, Live AI
// Embed, dan cara pakai kunci API dari n8n/Zapier/Make.
import { BarChart3, Bot, ChevronDown, Plug, Workflow } from 'lucide-react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { authOptions } from '@/lib/auth'
import { publicBaseUrl } from '@/lib/review-token'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Script & Embed · Hulao',
}

function Snippet({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-warm-900 p-3 text-xs leading-relaxed text-warm-50">
      <code>{children}</code>
    </pre>
  )
}

function ToolCard({
  icon,
  title,
  summary,
  children,
}: {
  icon: ReactNode
  title: string
  summary: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span className="flex items-start gap-3">
              {icon}
              <span>
                <span className="block text-sm font-semibold text-warm-900">{title}</span>
                <span className="block text-sm text-warm-500">{summary}</span>
              </span>
            </span>
            <ChevronDown
              className="mt-1 size-4 shrink-0 text-warm-400 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="mt-4 space-y-3 border-t border-warm-100 pt-4">{children}</div>
        </details>
      </CardContent>
    </Card>
  )
}

export default async function PengembangIntegrasiPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const baseUrl = publicBaseUrl()

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <PageHeader
        icon={Plug}
        title="Script & Embed"
        description="Script yang dipasang di landing page, dan cara menyambungkan Hulao ke tool otomasi."
      />

      <div className="space-y-3">
        <ToolCard
          icon={<BarChart3 className="mt-0.5 size-4 shrink-0 text-primary-500" aria-hidden />}
          title="LP Tracker"
          summary="Rekam perilaku pengunjung landing page Hulao — sudah terpasang otomatis."
        >
          <p className="text-sm text-warm-600">
            Merekam pageview, scroll 25/50/75/100%, lama tinggal, klik CTA, klik keluar, submit form,
            dan peta panas klik. <strong>Tidak perlu dipasang manual</strong> — otomatis disisipkan ke
            setiap landing page Hulao yang dipublikasikan (
            <code className="font-mono text-xs">{baseUrl}/p/slug-kamu</code>).
          </p>
          <p className="text-sm text-warm-600">
            Satu-satunya yang perlu kamu lakukan: beri atribut{' '}
            <code className="font-mono text-xs">data-lp-cta=&quot;nama-tombol&quot;</code> pada tombol
            penting supaya masuk laporan CTA.
          </p>
          <Snippet>{`<a href="/checkout" data-lp-cta="checkout-atas">Pesan Sekarang</a>`}</Snippet>
          <p className="text-xs text-warm-500">
            Tanpa atribut itu, yang otomatis dihitung CTA hanya <code className="font-mono">&lt;button&gt;</code>{' '}
            dan tautan wa.me / tel: / anchor #bagian. Tautan mailto: dan domain luar tercatat sebagai
            klik keluar; tautan ke halaman sendiri hanya masuk peta panas. Isi field input tidak pernah
            direkam; IP di-hash di server.
          </p>
        </ToolCard>

        <ToolCard
          icon={<Bot className="mt-0.5 size-4 shrink-0 text-primary-500" aria-hidden />}
          title="Live AI Embed"
          summary="Tempelkan host AI Hulao di landing page mana pun — termasuk situs di domain sendiri."
        >
          <p className="text-sm text-warm-600">
            Di LP Hulao script ini terpasang otomatis begitu Live Embed diaktifkan. Potongan di bawah
            untuk landing page yang kamu hosting sendiri:
          </p>
          <Snippet>{`<div data-hulao-live-embed></div>
<script src="${baseUrl}/hulao-live-embed.js"
        data-lp-id="LP_ID"
        data-base-url="${baseUrl}"></script>`}</Snippet>
          <p className="text-xs text-warm-500">
            Hanya <code className="font-mono">data-lp-id</code> yang wajib. Posisi (menyatu / mengambang
            di pojok), label tombol, dan form lead diatur dari pengaturan Live Embed di landing page
            terkait. Setelan ukuran hanya berlaku mode menyatu — mode mengambang selalu 360×600.
            Saat lead masuk, event konversi otomatis diteruskan ke Meta Pixel, GA, dan TikTok Pixel
            yang terpasang di halamanmu.
          </p>
        </ToolCard>

        <ToolCard
          icon={<Workflow className="mt-0.5 size-4 shrink-0 text-primary-500" aria-hidden />}
          title="n8n · Zapier · Make"
          summary="Sambungkan lewat kunci API (tarik data) dan webhook (terima event)."
        >
          <ul className="space-y-2 text-sm text-warm-600">
            <li>
              <strong>n8n</strong> — node <em>Webhook</em> untuk menerima event dari endpoint
              Webhook; node <em>HTTP Request</em> + Header Auth (<code className="font-mono text-xs">Authorization:
              Bearer hl_live_…</code>) untuk menarik/mengirim data.
            </li>
            <li>
              <strong>Zapier</strong> — <em>Webhooks by Zapier</em>: &quot;Catch Hook&quot; untuk menerima,
              &quot;Custom Request&quot; untuk memanggil API.
            </li>
            <li>
              <strong>Make</strong> — modul <em>Webhooks</em> dan <em>HTTP</em>, pola yang sama.
            </li>
          </ul>
          <p className="text-xs text-warm-500">
            Buat kunci di menu API dan endpoint di menu Webhook. Simpan kunci &amp; signing secret di
            credential store masing-masing tool — jangan di URL.
          </p>
        </ToolCard>
      </div>
    </div>
  )
}
