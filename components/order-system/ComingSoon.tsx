// Placeholder untuk halaman Order System yang implementasinya menyusul di
// phase berikutnya. Server component.
import { Construction } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

interface ComingSoonProps {
  title: string
  phase: string
  description: string
}

export function ComingSoon({ title, phase, description }: ComingSoonProps) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center">
      <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <Construction className="size-8" />
      </div>

      <h1 className="font-display text-2xl font-bold text-warm-900 md:text-3xl">
        {title}
      </h1>
      <p className="mt-2 text-warm-600">{description}</p>

      <div className="mt-6 w-full rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
        <p className="text-sm font-medium text-amber-900">
          🚧 {phase} — sedang dikerjakan
        </p>
        <p className="mt-1 text-sm text-amber-800">
          Fitur ini akan tersedia di update berikutnya. Sementara kamu sudah bisa
          setup rekening bank untuk terima transfer customer.
        </p>
      </div>

      <div className="mt-8">
        <Button asChild size="lg" variant="outline">
          <Link href="/bank-accounts">Setup Rekening Bank</Link>
        </Button>
      </div>
    </div>
  )
}
