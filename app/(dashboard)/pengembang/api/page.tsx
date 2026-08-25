// Halaman /pengembang/api — pola "Developers" kirimchat: rail tab kiri
// (Kunci API / Playground / Dokumentasi), konten fokus per tab.
import { BookMarked, Code2, KeyRound, TerminalSquare } from 'lucide-react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { ApiDocsSection } from '@/components/developer/ApiDocsSection'
import { ApiKeysClient } from '@/components/developer/ApiKeysClient'
import { ApiPlayground } from '@/components/developer/ApiPlayground'
import { DevShell } from '@/components/developer/DevShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
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
  const initialKeys = keys.map((k) => ({
    ...k,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    expiresAt: k.expiresAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
  }))

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <PageHeader
        icon={Code2}
        title="API"
        description="Kelola kunci, coba endpoint, dan baca dokumentasinya — untuk n8n, Zapier, Make, atau skrip sendiri."
      />
      <DevShell
        tabs={[
          {
            id: 'keys',
            label: 'Kunci API',
            icon: <KeyRound className="size-4" aria-hidden />,
            content: (
              <div className="space-y-4">
                <Card>
                  <CardContent className="flex items-start gap-3 pt-4 text-sm">
                    <TerminalSquare className="mt-0.5 size-4 shrink-0 text-primary-500" aria-hidden />
                    <p className="text-warm-600">
                      Kirim kunci lewat header{' '}
                      <code className="rounded bg-warm-100 px-1.5 py-0.5 font-mono text-xs">
                        Authorization: Bearer hl_live_…
                      </code>{' '}
                      pada setiap request. Kunci tidak boleh ditaruh di URL.
                    </p>
                  </CardContent>
                </Card>
                <ApiKeysClient initialKeys={initialKeys} />
              </div>
            ),
          },
          {
            id: 'playground',
            label: 'Playground',
            icon: <TerminalSquare className="size-4" aria-hidden />,
            badge: 'Baru',
            content: <ApiPlayground />,
          },
          {
            id: 'docs',
            label: 'Dokumentasi',
            icon: <BookMarked className="size-4" aria-hidden />,
            content: <ApiDocsSection baseUrl={publicBaseUrl()} />,
          },
        ]}
      />
    </div>
  )
}
