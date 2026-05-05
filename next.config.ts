import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Standalone output supaya Docker image kecil & self-contained.
  // Output ada di .next/standalone/server.js (semua dependency tertraced).
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'tripay.co.id',
      },
    ],
  },
}

export default nextConfig
