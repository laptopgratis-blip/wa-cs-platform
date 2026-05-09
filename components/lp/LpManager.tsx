'use client'

// Landing Page Manager — list LP user, info kuota, tombol create/edit/preview/delete.
import type { LpTier } from '@prisma/client'
import {
  BarChart3,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  Globe,
  HardDrive,
  Layers,
  Loader2,
  Plus,
  Sparkles,
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

interface AiStats {
  totalGenerations: number
  audited: {
    count: number
    inputTokens: number
    outputTokens: number
    providerCostUsd: number
    providerCostRp: number
    platformTokensCharged: number
  }
  legacy: {
    count: number
    estimatedProviderCostUsd: number
    estimatedProviderCostRp: number
  }
}

export function LpManager() {
  const [pages, setPages] = useState<LpRow[]>([])
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [aiStats, setAiStats] = useState<AiStats | null>(null)
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
    // Stats AI generation — fail-safe, kalau error UI tetap render tanpa stats card.
    void (async () => {
      try {
        const res = await fetch('/api/lp/generate/stats', { cache: 'no-store' })
        const json = await res.json()
        if (json.success) setAiStats(json.data as AiStats)
      } catch {
        /* abaikan */
      }
    })()
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
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/pricing">
              <Sparkles className="mr-2 size-4 text-primary-500" />
              Upgrade Paket
            </Link>
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            disabled={lpFull}
            className="bg-primary-500 text-white shadow-orange hover:bg-primary-600"
          >
            <Plus className="mr-2 size-4" />
            Buat LP Baru
          </Button>
        </div>
      </div>

      {/* Banner upgrade — muncul saat user FREE atau quota sudah penuh */}
      {quota && (quota.tier === 'FREE' || lpFull) && (
        <Card className="rounded-xl border-amber-200 bg-amber-50">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Sparkles className="size-4" />
              </div>
              <div>
                <p className="font-display text-sm font-bold text-amber-900">
                  {lpFull
                    ? `Kamu sudah menggunakan ${quota.currentLp} dari ${quota.maxLp === 999 ? '∞' : quota.maxLp} LP`
                    : 'Kamu di paket FREE'}
                </p>
                <p className="mt-0.5 text-xs text-amber-800">
                  Upgrade untuk lebih banyak LP dan storage gambar.
                </p>
              </div>
            </div>
            <Button
              asChild
              size="sm"
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              <Link href="/pricing">Upgrade Sekarang</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Total views card — quick analytics glance, hanya tampil kalau ada LP */}
      {pages.length > 0 && (
        <div
          className={`grid gap-3 ${
            aiStats && aiStats.totalGenerations > 0
              ? 'sm:grid-cols-2 lg:grid-cols-4'
              : 'sm:grid-cols-3'
          }`}
        >
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
          {aiStats && aiStats.totalGenerations > 0 && (
            <Card
              className="rounded-xl border-purple-200 bg-purple-50/40"
              title={
                aiStats.legacy.count > 0
                  ? `${aiStats.audited.count} kali tercatat akurat dari log + ${aiStats.legacy.count} kali estimasi (data sebelum 2026-05-09).`
                  : 'Biaya provider AI (Claude). Token platform yg dipotong: ' +
                    `${aiStats.audited.platformTokensCharged}/generate × Rp${(2).toLocaleString('id-ID')} (default).`
              }
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
                  <Sparkles className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-warm-500">
                    AI Generate · {aiStats.totalGenerations}×
                  </div>
                  <div className="font-display text-xl font-bold tabular-nums text-warm-900 dark:text-warm-50">
                    Rp{' '}
                    {formatNumber(
                      Math.round(
                        aiStats.audited.providerCostRp +
                          aiStats.legacy.estimatedProviderCostRp,
                      ),
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] text-warm-500">
                    biaya provider · ~$
                    {(
                      aiStats.audited.providerCostUsd +
                      aiStats.legacy.estimatedProviderCostUsd
                    ).toFixed(4)}
                    {aiStats.legacy.count > 0 && (
                      <span className="ml-0.5 text-amber-700">*</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      {aiStats && aiStats.legacy.count > 0 && (
        <p className="-mt-2 text-[11px] text-warm-500">
          *{aiStats.legacy.count} dari {aiStats.totalGenerations} generasi adalah
          data lama (sebelum 2026-05-09) — token tidak tercatat per-call, biaya
          dihitung pakai estimasi rata-rata Haiku 4.5.
        </p>
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
                    {/* LP Lab — Phase 2 (Power only). Tombol selalu tampil
                        supaya user lain tahu fitur exists; gating di page itu sendiri. */}
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      title="LP Lab — analytics & optimasi (POWER plan)"
                    >
                      <Link href={`/landing-pages/${lp.id}/lab`}>
                        <BarChart3 className="size-3.5" />
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
