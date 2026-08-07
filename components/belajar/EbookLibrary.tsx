'use client'

// Perpustakaan E-Book di portal /belajar — daftar e-book milik pembeli
// (per entitlement) + tombol download bertoken.
//
// Flow download: POST /api/ebook/request-download {entitlementId} → dapat
// URL token TTL 15 menit → arahkan browser ke URL itu (Content-Disposition
// attachment → file terunduh, halaman tidak pindah).
import { BookOpen, Clock, Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export interface EbookLibraryItem {
  entitlementId: string
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED'
  grantedAt: string
  expiresAt: string | null
  downloadCount: number
  maxDownloads: number
  ebook: {
    id: string
    title: string
    description: string | null
    coverUrl: string | null
    fileFormat: 'PDF' | 'EPUB'
    fileSizeBytes: number
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const STATUS_BADGE: Record<
  EbookLibraryItem['status'],
  { label: string; cls: string }
> = {
  ACTIVE: { label: 'Aktif', cls: 'bg-emerald-100 text-emerald-800' },
  EXPIRED: { label: 'Kedaluwarsa', cls: 'bg-amber-100 text-amber-800' },
  REVOKED: { label: 'Dicabut', cls: 'bg-rose-100 text-rose-800' },
}

export function EbookLibrary({ items }: { items: EbookLibraryItem[] }) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  async function handleDownload(item: EbookLibraryItem) {
    setDownloadingId(item.entitlementId)
    try {
      const res = await fetch('/api/ebook/request-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entitlementId: item.entitlementId }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error ?? 'Gagal membuat link download')
        return
      }
      // Content-Disposition attachment → browser download tanpa pindah page.
      window.location.href = json.data.url
      toast.success('Download dimulai…')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setDownloadingId(null)
    }
  }

  if (items.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-bold text-warm-900">
        Perpustakaan E-Book
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const badge = STATUS_BADGE[item.status]
          const remaining = Math.max(
            0,
            item.maxDownloads - item.downloadCount,
          )
          const canDownload = item.status === 'ACTIVE' && remaining > 0
          return (
            <Card
              key={item.entitlementId}
              className="overflow-visible rounded-xl border-warm-200"
            >
              <CardContent className="space-y-3 p-4">
                {item.ebook.coverUrl && (
                  <img
                    src={item.ebook.coverUrl}
                    alt={item.ebook.title}
                    className="aspect-video w-full rounded-lg object-cover"
                  />
                )}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-bold text-warm-900">
                      {item.ebook.title}
                    </h3>
                    <Badge className={`${badge.cls} hover:${badge.cls}`}>
                      {badge.label}
                    </Badge>
                  </div>
                  {item.ebook.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-warm-600">
                      {item.ebook.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-warm-600">
                  <span className="flex items-center gap-1">
                    <BookOpen className="size-3" />
                    {item.ebook.fileFormat} · {formatSize(item.ebook.fileSizeBytes)}
                  </span>
                  <span>
                    Download: {item.downloadCount}/{item.maxDownloads}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {item.expiresAt
                      ? `s.d. ${formatDate(item.expiresAt)}`
                      : 'Selamanya'}
                  </span>
                </div>

                <Button
                  className="w-full bg-primary-500 text-white hover:bg-primary-600"
                  disabled={!canDownload || downloadingId === item.entitlementId}
                  onClick={() => handleDownload(item)}
                >
                  {downloadingId === item.entitlementId ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 size-4" />
                  )}
                  {item.status === 'REVOKED'
                    ? 'Akses Dicabut'
                    : item.status === 'EXPIRED'
                      ? 'Akses Berakhir'
                      : remaining === 0
                        ? 'Jatah Download Habis'
                        : 'Download'}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
