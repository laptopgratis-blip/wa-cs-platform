'use client'

// ImageTile — satu kartu di grid ImageManager: thumbnail, nama, ukuran,
// tombol salin URL & hapus.
// Varian 'inline' (panel HP): target sentuh 44px (DESIGN.md § Responsif),
// jarak antar-tombol 8px, dan nama 2 baris — tooltip `title` tidak muncul di
// layar sentuh, jadi nama yang dipotong 1 baris tidak bisa dibaca utuh.
// Varian 'sidebar' (desktop) tetap ringkas seperti semula.
import { Copy, Loader2, Trash2 } from 'lucide-react'
import Image from 'next/image'

import type { ImageManagerVariant } from '@/components/lp/ImageManager'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

interface ImageTileProps {
  image: { originalName: string; url: string; size: number }
  // Kelas tambahan root (mis. aturan preview 2 baris dari ImageManager).
  className?: string
  variant: ImageManagerVariant
  isDeleting: boolean
  onCopyUrl: () => void
  onDelete: () => void
}

export function ImageTile({
  className,
  image,
  variant,
  isDeleting,
  onCopyUrl,
  onDelete,
}: ImageTileProps) {
  const isInline = variant === 'inline'
  return (
    <div
      className={cn(
        // flex kolom + tombol mt-auto → tombol sejajar di satu baris grid
        // walau panjang nama berbeda.
        'border-warm-200 bg-warm-50 flex flex-col overflow-hidden rounded-md border',
        className,
      )}
    >
      <div className="bg-warm-100 relative aspect-square w-full">
        <Image
          src={image.url}
          alt={image.originalName}
          fill
          sizes={isInline ? '50vw' : '140px'}
          className="object-cover"
          unoptimized
        />
      </div>
      <div
        className={cn('flex flex-1 flex-col gap-1', isInline ? 'p-2' : 'p-1.5')}
      >
        <div
          className={cn(
            'text-warm-800 text-xs font-medium',
            // inline: selalu setinggi 2 baris supaya ukuran file sejajar
            isInline ? 'line-clamp-2 min-h-8 wrap-anywhere' : 'truncate',
          )}
          title={image.originalName}
        >
          {image.originalName}
        </div>
        <div className="text-warm-500 text-xs">{formatBytes(image.size)}</div>
        <div
          className={cn(
            'mt-auto flex items-center',
            isInline ? 'gap-2 pt-1' : 'gap-1',
          )}
        >
          <Button
            size={isInline ? 'default' : 'sm'}
            variant={isInline ? 'outline' : 'ghost'}
            className={cn('flex-1', isInline ? 'h-11' : 'h-6 px-1 text-xs')}
            onClick={onCopyUrl}
            title="Salin URL gambar"
            aria-label={`Salin URL ${image.originalName}`}
          >
            <Copy className={cn(!isInline && 'mr-1 size-3')} aria-hidden />
            URL
          </Button>
          <Button
            size={isInline ? 'icon' : 'sm'}
            variant="ghost"
            className={cn(
              'text-destructive hover:bg-destructive/10 hover:text-destructive',
              isInline ? 'size-11' : 'h-6 px-1.5',
            )}
            onClick={onDelete}
            disabled={isDeleting}
            title="Hapus gambar"
            aria-label={`Hapus ${image.originalName}`}
          >
            {isDeleting ? (
              <Loader2
                className={cn('animate-spin', !isInline && 'size-3')}
                aria-hidden
              />
            ) : (
              <Trash2 className={cn(!isInline && 'size-3')} aria-hidden />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
