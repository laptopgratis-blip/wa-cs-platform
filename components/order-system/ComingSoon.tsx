// Placeholder untuk halaman Order System yang implementasinya menyusul di
// phase berikutnya. Server component.
import { Construction } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface ComingSoonProps {
  title: string
  phase: string
  description: string
}

export function ComingSoon({ title, phase, description }: ComingSoonProps) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center">
      <div
        className={cn(
          'mb-6 flex size-16 items-center justify-center rounded-full',
          TONES.warning.bg,
          TONES.warning.text,
        )}
      >
        <Construction className="size-8" />
      </div>

      <h1 className="font-display text-warm-900 text-2xl font-bold md:text-3xl">
        {title}
      </h1>
      <p className="text-warm-600 mt-2">{description}</p>

      <div
        className={cn(
          'mt-6 w-full rounded-xl border p-4 text-left',
          TONES.warning.bg,
          TONES.warning.border,
        )}
      >
        <p
          className={cn(
            'flex items-start gap-2 text-sm font-medium',
            TONES.warning.text,
          )}
        >
          <Construction className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{phase} — sedang dikerjakan</span>
        </p>
        <p className={cn('mt-1 text-sm', TONES.warning.text)}>
          Fitur ini akan tersedia di update berikutnya. Sementara kamu sudah
          bisa setup rekening bank untuk terima transfer customer.
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
