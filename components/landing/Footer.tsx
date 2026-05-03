// Footer landing — light theme, warm-50 bg, separator orange untuk konsistensi.
import { MessageCircle } from 'lucide-react'
import Link from 'next/link'

export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-warm-200 bg-warm-50 text-warm-600">
      <div className="container mx-auto flex flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary-500 text-white shadow-orange">
            <MessageCircle className="size-3.5" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-sm font-bold text-warm-900">
              WA CS Platform
            </p>
            <p className="text-[11px] text-primary-500">Citrus Energy</p>
          </div>
        </Link>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Link href="#cara-kerja" className="transition-colors hover:text-warm-900">
            Cara Kerja
          </Link>
          <Link href="#harga" className="transition-colors hover:text-warm-900">
            Harga
          </Link>
          <Link href="/login" className="transition-colors hover:text-warm-900">
            Masuk
          </Link>
          <Link href="/register" className="transition-colors hover:text-warm-900">
            Daftar
          </Link>
        </nav>
        <p className="text-xs text-warm-400">© {year} WA CS Platform</p>
      </div>
    </footer>
  )
}
