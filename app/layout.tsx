import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'

import { Providers } from '@/components/providers'

import './globals.css'

// Plus Jakarta Sans untuk display/heading — bold, modern, ceria.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

// Inter untuk body — readable di ukuran kecil.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Hulao — CS WhatsApp Otomatis + CRM + Landing Page Builder',
  description:
    'Hulao menghubungkan WhatsApp bisnis kamu dengan AI — balas pelanggan 24/7, kelola CRM, dan buat landing page dalam satu platform.',
}

// `viewportFit: 'cover'` wajib supaya `env(safe-area-inset-*)` return nilai
// real di iPhone (notch/home-indicator). Tanpa ini, semua perhitungan
// safe-area = 0 → BottomNav nutup konten halaman.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="id"
      className={`${jakarta.variable} ${inter.variable} ${jetbrains.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
