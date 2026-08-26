// Halaman /pengembang/webhook — kelola endpoint webhook keluar (dipisah dari
// halaman Integrasi lama, 2026-08-26). Terima event Hulao (pesan masuk,
// perubahan status, kontak baru) di sistemmu.
import { Webhook } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { WebhookEndpointsClient } from '@/components/developer/WebhookEndpointsClient'
import { PageHeader } from '@/components/shared/PageHeader'
import { authOptions } from '@/lib/auth'
import { listWebhookEndpoints } from '@/lib/services/webhooks/endpoints'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Webhook · Hulao',
}

export default async function PengembangWebhookPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const endpoints = await listWebhookEndpoints(session.user.id)
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
        icon={Webhook}
        title="Webhook"
        description="Terima event Hulao — pesan masuk, perubahan status, kontak baru — langsung di sistemmu (n8n, Zapier, backend sendiri)."
      />

      <WebhookEndpointsClient initialEndpoints={initialEndpoints} />

      <p className="text-xs text-warm-500">
        Payload: <code className="font-mono">{'{ id, type, createdAt, data }'}</code> + header{' '}
        <code className="font-mono">X-Hulao-Signature</code> (HMAC SHA-256) &amp;{' '}
        <code className="font-mono">X-Hulao-Event</code>. Cara verifikasi tanda tangan ada di tab
        Webhooks halaman{' '}
        <Link href="/pengembang/api" className="text-primary-600 underline">
          API
        </Link>
        . Gagal di-retry bertahap sampai 6×; gagal beruntun terus-menerus menonaktifkan endpoint
        otomatis.
      </p>
    </div>
  )
}
