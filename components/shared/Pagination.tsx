'use client'

// Pager offset standar — diekstrak dari WhatsappSessionsManager. Dipakai semua
// tabel/list yang paginasi via page/pageSize supaya kontrol & teks seragam.
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  isLoading?: boolean
  onPageChange: (page: number) => void
  // Kata benda untuk teks "Tidak ada <noun>" saat kosong (mis. "kontak").
  noun?: string
}

export function Pagination({
  page,
  pageSize,
  total,
  isLoading = false,
  onPageChange,
  noun = 'data',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const fromRow = total === 0 ? 0 : (page - 1) * pageSize + 1
  const toRow = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        {total === 0
          ? `Tidak ada ${noun}`
          : `Menampilkan ${fromRow}–${toRow} dari ${formatNumber(total)}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-label="Halaman sebelumnya"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1 || isLoading}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm tabular-nums text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          aria-label="Halaman berikutnya"
          onClick={() => onPageChange(page + 1)}
          disabled={page * pageSize >= total || isLoading}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
