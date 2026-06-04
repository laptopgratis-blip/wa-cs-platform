'use client'

import { BarChart3, Copy, ExternalLink, Loader2, Pencil, Plus, Radio, Sparkles, Trash2, Users } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
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

  const fetchRows = useCallback(async () => {
    const res = await fetch('/api/live-rooms')
    const json = (await res.json()) as { success: boolean; data?: LiveRoomRow[] }
    if (json.success && json.data) setRows(json.data)
  }, [])

  useEffect(() => {
    void fetchRows()
  }, [fetchRows])

  async function deleteRoom(id: string, name: string) {
    if (!confirm(`Hapus live room "${name}"?`)) return
    const res = await fetch(`/api/live-rooms/${id}`, { method: 'DELETE' })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (json.success) {
      toast.success('Room dihapus')
      void fetchRows()
    } else {
      toast.error(json.error ?? 'Gagal hapus')
    }
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/live/${slug}`
    navigator.clipboard.writeText(url)
    toast.success(`Link tersalin: ${url}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Live Rooms</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live shopping AI dengan host avatar. Customer akses URL publik —
            chat dengan AI host yang ngobrol soal produk Anda + suara TTS.
          </p>
        </div>
        <Link href="/live-rooms/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Bikin Live Room
          </Button>
        </Link>
      </div>

      {rows === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat…
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Belum ada live room. Pastikan ada minimal 1 host template (siap
            di-pakai dari library admin atau yang Anda generate sendiri) sebelum
            bikin room.
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
                        <Badge className="bg-emerald-100 text-emerald-700">
                          <Radio className="mr-1 h-3 w-3" /> LIVE
                        </Badge>
                      ) : (
                        <Badge className="bg-warm-100 text-warm-700">Off</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Host: {row.hostTemplate.name}
                    </div>
                    <div className="mt-1 font-mono text-xs text-orange-600">
                      /live/{row.slug}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyLink(row.slug)}>
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copy Link
                  </Button>
                  <Link href={`/live/${row.slug}`} target="_blank">
                    <Button size="sm" variant="outline">
                      <ExternalLink className="mr-1 h-3.5 w-3.5" /> Buka
                    </Button>
                  </Link>
                  <Link href={`/live-rooms/${row.id}/leads`}>
                    <Button size="sm" variant="outline">
                      <Users className="mr-1 h-3.5 w-3.5" /> Leads
                    </Button>
                  </Link>
                  <Link href={`/live-rooms/${row.id}/objections`}>
                    <Button size="sm" variant="outline">
                      <BarChart3 className="mr-1 h-3.5 w-3.5" /> Objection
                    </Button>
                  </Link>
                  <Link href={`/live-rooms/${row.id}/improve`}>
                    <Button size="sm" variant="outline">
                      <Sparkles className="mr-1 h-3.5 w-3.5" /> Optimasi
                    </Button>
                  </Link>
                  <Link href={`/live-rooms/${row.id}`}>
                    <Button size="sm" variant="outline">
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteRoom(row.id, row.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
