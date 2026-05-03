'use client'

// Landing Page Manager — list LP user, info kuota, tombol create/edit/preview/delete.
import type { LpTier } from '@prisma/client'
import {
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  Globe,
  HardDrive,
  Layers,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { CreateLpModal } from '@/components/lp/CreateLpModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

interface LpRow {
  id: string
  title: string
  slug: string
  isPublished: boolean
  viewCount: number
  createdAt: string
  updatedAt: string
}

interface QuotaInfo {
  tier: LpTier
  maxLp: number
  currentLp: number
  maxStorageMB: number
  storageUsedMB: number
}

const TIER_LABEL: Record<LpTier, string> = {
  FREE: 'Free',
  STARTER: 'Starter',
  POPULAR: 'Popular',
  POWER: 'Power',
}

export function LpManager() {
  const [pages, setPages] = useState<LpRow[]>([])
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/lp')
      const json = (await res.json()) as {
        success: boolean
        data?: { pages: LpRow[]; quota: QuotaInfo }
      }
      if (json.success && json.data) {
        setPages(json.data.pages)
        setQuota(json.data.quota)
      }
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  async function handleDelete(lp: LpRow) {
    if (
      !confirm(
        `Hapus LP "${lp.title}"? Semua gambar yang menempel di LP ini juga dihapus.`,
      )
    )
      return
    setDeletingId(lp.id)
    try {
      const res = await fetch(`/api/lp/${lp.id}`, { method: 'DELETE' })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menghapus')
        return
      }
      toast.success('LP berhasil dihapus')
      void load()
    } finally {
      setDeletingId(null)
    }
  }

  const lpFull = quota ? quota.currentLp >= quota.maxLp : false
  const storagePct =
    quota && quota.maxStorageMB > 0
      ? Math.min(100, (quota.storageUsedMB / quota.maxStorageMB) * 100)
      : 0
  const lpPct =
    quota && quota.maxLp > 0
      ? Math.min(100, (quota.currentLp / quota.maxLp) * 100)
      : 0

  // Total views semua LP user — analytics quick-glance.
  const totalViews = pages.reduce((sum, p) => sum + p.viewCount, 0)
  const publishedCount = pages.filter((p) => p.isPublished).length

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text)
    toast.success('URL disalin')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
            Landing Page Saya
          </h1>
          <p className="mt-1 text-sm text-warm-500">
            Buat halaman promosi sendiri dengan editor visual.
            {quota && (
              <span className="ml-1 text-warm-400">
                · {quota.currentLp}/{quota.maxLp === 999 ? '∞' : quota.maxLp}{' '}
                LP · {quota.storageUsedMB.toFixed(1)}/{quota.maxStorageMB} MB
                storage
              </span>
            )}
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          disabled={lpFull}
          className="bg-primary-500 text-white shadow-orange hover:bg-primary-600"
        >
          <Plus className="mr-2 size-4" />
          Buat LP Baru
        </Button>
      </div>

      {/* Total views card — quick analytics glance, hanya tampil kalau ada LP */}
      {pages.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="rounded-xl border-warm-200">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <Eye className="size-5" />
              </div>
              <div>
                <div className="text-xs text-warm-500">Total Views</div>
                <div className="font-display text-xl font-bold tabular-nums text-warm-900 dark:text-warm-50">
                  {formatNumber(totalViews)}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-warm-200">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Globe className="size-5" />
              </div>
              <div>
                <div className="text-xs text-warm-500">LP Live</div>
                <div className="font-display text-xl font-bold tabular-nums text-warm-900 dark:text-warm-50">
                  {publishedCount} / {pages.length}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-warm-200">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-warm-100 text-warm-600">
                <Layers className="size-5" />
              </div>
              <div>
                <div className="text-xs text-warm-500">LP Draft</div>
                <div className="font-display text-xl font-bold tabular-nums text-warm-900 dark:text-warm-50">
                  {pages.length - publishedCount}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Info Quota */}
      {quota && (
        <Card className="rounded-xl border-warm-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-warm-700">
                Kuota Paket Kamu
              </CardTitle>
              <Badge variant="outline" className="font-semibold">
                {TIER_LABEL[quota.tier]}
              </Badge>
            </div>
            <CardDescription className="text-xs text-warm-500">
              Beli paket token untuk upgrade kuota otomatis.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-warm-500">
                  <Layers className="size-3.5" />
                  Landing Page
                </div>
                <div className="font-medium tabular-nums">
                  {quota.currentLp} / {quota.maxLp === 999 ? '∞' : quota.maxLp}
                </div>
              </div>
              <Progress value={lpPct} className="h-1.5" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-warm-500">
                  <HardDrive className="size-3.5" />
                  Storage
                </div>
                <div className="font-medium tabular-nums">
                  {quota.storageUsedMB.toFixed(1)} MB / {quota.maxStorageMB} MB
                </div>
              </div>
              <Progress value={storagePct} className="h-1.5" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daftar LP */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : pages.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-16 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-600">
              <Globe className="size-5" />
            </div>
            <div>
              <p className="font-display text-base font-bold text-warm-900 dark:text-warm-50">
                Belum ada landing page
              </p>
              <p className="mt-1 text-sm text-warm-500">
                Buat halaman pertamamu untuk promosi atau funnel.
              </p>
            </div>
            <Button
              onClick={() => setCreateOpen(true)}
              disabled={lpFull}
              className="bg-primary-500 text-white shadow-orange hover:bg-primary-600"
            >
              <Plus className="mr-2 size-4" />
              Buat LP Pertama
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pages.map((lp) => {
            const publicPath = `/p/${lp.slug}`
            const fullUrl =
              typeof window !== 'undefined'
                ? `${window.location.origin}${publicPath}`
                : publicPath
            return (
              <Card
                key={lp.id}
                className={cn(
                  'flex flex-col rounded-xl border-warm-200 transition-shadow hover:shadow-md',
                  lp.isPublished && 'ring-1 ring-emerald-200',
                )}
              >
                <CardContent className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={cn(
                        'flex size-10 items-center justify-center rounded-lg',
                        lp.isPublished
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-primary-50 text-primary-600',
                      )}
                    >
                      <Globe className="size-5" />
                    </div>
                    {lp.isPublished ? (
                      <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                        Live
                      </Badge>
                    ) : (
                      <Badge variant="outline">Draft</Badge>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-display text-base font-bold text-warm-900 dark:text-warm-50">
                      {lp.title}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-xs text-warm-500">
                      {publicPath}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-warm-500">
                    <span className="flex items-center gap-1">
                      <Eye className="size-3.5" />
                      {formatNumber(lp.viewCount)} views
                    </span>
                    <span>•</span>
                    <span>
                      Update{' '}
                      {new Date(lp.updatedAt).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 border-t border-warm-100 pt-3">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <Link href={`/landing-pages/${lp.id}/edit`}>
                        <Edit3 className="mr-1.5 size-3.5" />
                        Edit
                      </Link>
                    </Button>
                    {lp.isPublished && (
                      <>
                        <Button
                          asChild
                          size="sm"
                          className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          <a
                            href={publicPath}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="mr-1.5 size-3.5" />
                            Buka
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(fullUrl)}
                          title="Salin URL public"
                        >
                          <Copy className="size-3.5" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deletingId === lp.id}
                      onClick={() => handleDelete(lp)}
                      className="text-destructive hover:text-destructive"
                      title="Hapus LP"
                    >
                      {deletingId === lp.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <CreateLpModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false)
          void load()
        }}
      />
    </div>
  )
}
