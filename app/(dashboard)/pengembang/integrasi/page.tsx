// Halaman /pengembang/integrasi — pola "Integrations" kirimchat: fokus utama
// = endpoint webhook keluar (counter X/5, buat, uji, riwayat). Dokumentasi
// script LP Tracker / Live AI Embed / tool otomasi dilipat ke <details>
// supaya halaman tetap ringkas.
import { BarChart3, Bot, ChevronDown, Lock, Plug, Radio, Workflow } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { WebhookEndpointsClient } from '@/components/developer/WebhookEndpointsClient'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { publicBaseUrl } from '@/lib/review-token'
import { listWebhookEndpoints } from '@/lib/services/webhooks/endpoints'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Integrasi · Hulao',
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

  const [access, endpoints] = await Promise.all([
    checkOrderSystemAccess(session.user.id),
    listWebhookEndpoints(session.user.id),
  ])
  const baseUrl = publicBaseUrl()
  const initialEndpoints = endpoints.map((e) => ({
    ...e,
    autoDisabledAt: e.autoDisabledAt?.toISOString() ?? null,
    lastSuccessAt: e.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: e.lastFailureAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
  }))

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <PageHeader
        icon={Plug}
        title="Integrasi"
        description="Terima event Hulao lewat webhook, dan pasang script Hulao di landing page-mu."
      />

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-warm-900">Webhook Endpoint</h2>
        <WebhookEndpointsClient initialEndpoints={initialEndpoints} />
        <p className="text-xs text-warm-500">
          Payload: <code className="font-mono">{'{ id, type, createdAt, data }'}</code> + header{' '}
          <code className="font-mono">X-Hulao-Signature</code> (HMAC SHA-256) &{' '}
          <code className="font-mono">X-Hulao-Event</code>. Cara verifikasi tanda tangan ada di tab
          Dokumentasi halaman{' '}
          <Link href="/pengembang/api" className="text-primary-600 underline">
            API
          </Link>
          . Gagal di-retry bertahap sampai 6×; gagal beruntun terus-menerus menonaktifkan endpoint
          otomatis.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-warm-900">Script &amp; Tool</h2>

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
              <strong>n8n</strong> — node <em>Webhook</em> untuk menerima event dari endpoint di atas;
              node <em>HTTP Request</em> + Header Auth (<code className="font-mono text-xs">Authorization:
              Bearer hl_live_…</code>) untuk menarik data.
            </li>
            <li>
              <strong>Zapier</strong> — <em>Webhooks by Zapier</em>: &quot;Catch Hook&quot; untuk menerima,
              &quot;Custom Request&quot; untuk menarik data.
            </li>
            <li>
              <strong>Make</strong> — modul <em>Webhooks</em> dan <em>HTTP</em>, pola yang sama.
            </li>
          </ul>
          <p className="text-xs text-warm-500">
            Simpan kunci & signing secret di credential store masing-masing tool — jangan di URL.
          </p>
        </ToolCard>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-warm-900">Fitur Toko</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="space-y-2 pt-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-warm-900">
                <Radio className="size-4 text-primary-500" aria-hidden /> Pixel Tracking
              </p>
              <p className="text-sm text-warm-500">
                Kirim event pesanan ke Meta, Google, dan TikTok Ads dari sisi server.
              </p>
              {access.hasAccess ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/integrations/pixels">Atur Pixel</Link>
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href="/pricing">
                    <Lock className="mr-2 size-4" /> Paket POWER
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 pt-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-warm-900">
                <Plug className="size-4 text-primary-500" aria-hidden /> Auto Confirm Bank
              </p>
              <p className="text-sm text-warm-500">
                Cocokkan mutasi rekening dengan pesanan supaya konfirmasi transfer otomatis.
              </p>
              {access.hasAccess ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/integrations/bank-mutation">Atur Auto Confirm</Link>
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href="/pricing">
                    <Lock className="mr-2 size-4" /> Paket POWER
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
