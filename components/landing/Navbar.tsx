// Navbar landing page — putih, sticky, shadow halus.
import { MessageCircle } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-warm-200 bg-card/80 backdrop-blur-md shadow-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary-500 text-white shadow-orange">
            <MessageCircle className="size-4" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-base font-bold text-warm-900">WA CS</p>
            <p className="text-[11px] font-medium text-primary-500">Platform</p>
          </div>
        </Link>
        <nav className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-warm-700 hover:bg-warm-100 hover:text-warm-900"
          >
            <Link href="/login">Masuk</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="rounded-full bg-primary-500 px-5 font-semibold text-white shadow-orange hover:bg-primary-600 hover:shadow-orange-lg"
          >
            <Link href="/register">Daftar Gratis</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
