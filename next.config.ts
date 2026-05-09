import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Standalone output supaya Docker image kecil & self-contained.
  // Output ada di .next/standalone/server.js (semua dependency tertraced).
  output: 'standalone',
  images: {
    // Disable optimizer untuk semua <Image>. Alasan: Next.js standalone serve
    // /public dengan bug — file yang ditambahkan runtime (mis. upload foto
    // produk, bukti transfer) return 404, sehingga internal fetch optimizer
    // ke /uploads/... gagal. Browser sekarang request URL langsung yang
    // di-serve nginx (uploads-server) via Traefik. Aplikasi adalah dashboard
    // internal, tidak butuh image optimization untuk traffic publik.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'tripay.co.id',
      },
    ],
  },
}

export default nextConfig
