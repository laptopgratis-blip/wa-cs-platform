'use client'

import { BarChart3, Copy, ExternalLink, Pencil, Plus, Sparkles, Trash2, Users, Video } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface LiveRoomRow {
  id: string
  slug: string
  name: string
  isActive: boolean
  createdAt: string
  hostTemplate: { name: string; videoLoopUrl: string | null }
}

export function LiveRoomsList() {
  const [rows, setRows] = useState<LiveRoomRow[] | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LiveRoomRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchRows = useCallback(async () => {
    const res = await fetch('/api/live-rooms')
    const json = (await res.json()) as { success: boolean; data?: LiveRoomRow[] }
    if (json.success && json.data) setRows(json.data)
  }, [])

  useEffect(() => {
    void fetchRows()
  }, [fetchRows])

  async function deleteRoom() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/live-rooms/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (json.success) {
        toast.success('Room dihapus')
        setDeleteTarget(null)
        void fetchRows()
      } else {
        toast.error(json.error ?? 'Gagal hapus')
      }
    } finally {
      setIsDeleting(false)
    }
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/live/${slug}`
    navigator.clipboard.writeText(url)
    toast.success(`Link tersalin: ${url}`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Rooms"
        description="Live shopping AI dengan host avatar. Customer akses URL publik — chat dengan AI host yang ngobrol soal produk Anda + suara TTS."
        actions={
          <Link href="/live-rooms/new">
            <Button>
              <Plus className="mr-2 size-4" /> Bikin Live Room
            </Button>
          </Link>
        }
      />

      {rows === null ? (
        <CardGridSkeleton count={4} />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Video}
              title="Belum ada live room"
              description="Pastikan ada minimal 1 host template (dari library admin atau yang Anda generate sendiri) sebelum bikin room."
              action={
                <Link href="/live-rooms/new">
                  <Button>
                    <Plus className="mr-2 size-4" /> Bikin Live Room
                  </Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((row) => (
            <Card key={row.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-medium">{row.name}</h3>
                      {row.isActive ? (
                        <StatusBadge tone="success" label="LIVE" pulse />
                      ) : (
                        <StatusBadge tone="neutral" label="Off" />
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Host: {row.hostTemplate.name}
                    </div>
                    <div className="mt-1 font-mono text-xs text-primary-600">
                      /live/{row.slug}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyLink(row.slug)}>
                    <Copy className="mr-1 size-3.5" /> Copy Link
                  </Button>
                  <Link href={`/live/${row.slug}`} target="_blank">
                    <Button size="sm" variant="outline">
                      <ExternalLink className="mr-1 size-3.5" /> Buka
                    </Button>
                  </Link>
                  <Link href={`/live-rooms/${row.id}/leads`}>
                    <Button size="sm" variant="outline">
                      <Users className="mr-1 size-3.5" /> Leads
                    </Button>
                  </Link>
                  <Link href={`/live-rooms/${row.id}/objections`}>
                    <Button size="sm" variant="outline">
                      <BarChart3 className="mr-1 size-3.5" /> Objection
                    </Button>
                  </Link>
                  <Link href={`/live-rooms/${row.id}/improve`}>
                    <Button size="sm" variant="outline">
                      <Sparkles className="mr-1 size-3.5" /> Optimasi
                    </Button>
                  </Link>
                  <Link href={`/live-rooms/${row.id}`}>
                    <Button size="sm" variant="outline">
                      <Pencil className="mr-1 size-3.5" /> Edit
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Hapus room ${row.name}`}
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(row)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
        title={`Hapus live room "${deleteTarget?.name ?? ''}"?`}
        description="Room dan link publiknya tidak bisa diakses lagi setelah dihapus."
        isLoading={isDeleting}
        onConfirm={deleteRoom}
      />
    </div>
  )
}
