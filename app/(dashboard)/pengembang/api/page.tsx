// Halaman /pengembang/api — kelola kunci API + dokumentasi endpoint.
import { Code2 } from 'lucide-react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { ApiDocsSection } from '@/components/developer/ApiDocsSection'
import { ApiKeysClient } from '@/components/developer/ApiKeysClient'
import { PageHeader } from '@/components/shared/PageHeader'
import { authOptions } from '@/lib/auth'
import { publicBaseUrl } from '@/lib/review-token'
import { listSellerApiKeys } from '@/lib/services/seller-api-keys'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'API · Hulao',
}

export default async function PengembangApiPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const keys = await listSellerApiKeys(session.user.id)

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <PageHeader
        icon={Code2}
        title="API"
        description="Baca data akunmu dari skrip atau tool otomasi (n8n, Zapier, Make) memakai kunci API."
      />
      <ApiKeysClient
        initialKeys={keys.map((k) => ({
          ...k,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          expiresAt: k.expiresAt?.toISOString() ?? null,
          revokedAt: k.revokedAt?.toISOString() ?? null,
        }))}
      />
      <ApiDocsSection baseUrl={publicBaseUrl()} />
    </div>
  )
}
