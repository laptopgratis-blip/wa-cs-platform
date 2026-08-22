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
import { OnboardingHint } from '@/components/onboarding/OnboardingHint'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CardGridSkeleton } from '@/components/shared/skeletons'
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
import { TONES } from '@/lib/ui-tones'
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
  const [deleteTarget, setDeleteTarget] = useState<LpRow | null>(null)

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

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    try {
      const res = await fetch(`/api/lp/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menghapus')
        return
      }
      toast.success('LP berhasil dihapus')
      setDeleteTarget(null)
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
      <OnboardingHint
        hintId="landing-pages"
        relevantFor={['SELL_LP']}
        matchMessage="LP yang convert = headline jelas + foto produk + tombol WA besar. Pakai AI generator untuk bikin draft 1 menit, baru tweak isinya."
        matchCta={{
          label: 'Bikin LP dengan AI',
          href: '/landing-pages?action=create',
        }}
        mismatchMessage="Landing Page jadi pintu masuk customer dari iklan/sosmed. Kalau jualan langsung di WA tanpa funnel, fitur ini opsional."
      />
      <PageHeader
        title="Landing Page Saya"
        description={
          <>
            Buat halaman promosi sendiri dengan editor visual.
            {quota && (
              <span className="text-warm-400 ml-1">
                · {quota.currentLp}/{quota.maxLp === 999 ? '∞' : quota.maxLp} LP
                · {quota.storageUsedMB.toFixed(1)}/{quota.maxStorageMB} MB
                storage
              </span>
            )}
          </>
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/pricing">
                <Sparkles className="text-primary-500 mr-2 size-4" />
                Upgrade Paket
              </Link>
            </Button>
            <Button onClick={() => setCreateOpen(true)} disabled={lpFull}>
              <Plus className="mr-2 size-4" />
              Buat LP Baru
            </Button>
          </>
        }
      />

      {/* Banner upgrade — muncul saat user FREE atau quota sudah penuh */}
      {quota && (quota.tier === 'FREE' || lpFull) && (
        <Card className="bg-primary-50">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="bg-primary-100 text-primary-700 flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Sparkles className="size-4" />
              </div>
              <div>
                <p className="font-display text-warm-900 text-sm font-semibold">
                  {lpFull
                    ? `Kamu sudah menggunakan ${quota.currentLp} dari ${quota.maxLp === 999 ? '∞' : quota.maxLp} LP`
                    : 'Kamu di paket FREE'}
                </p>
                <p className="text-warm-700 mt-0.5 text-xs">
                  Upgrade untuk lebih banyak LP dan storage gambar.
                </p>
              </div>
            </div>
            <Button asChild size="sm">
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
          <Card>
            <CardContent className="flex items-center gap-3">
              <div className="bg-primary-50 text-primary-600 flex size-10 items-center justify-center rounded-lg">
                <Eye className="size-5" />
              </div>
              <div>
                <div className="text-warm-500 text-xs">Total Views</div>
                <div className="font-display text-warm-900 text-xl font-bold tabular-nums">
                  {formatNumber(totalViews)}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3">
              <div
                className={cn(
                  'flex size-10 items-center justify-center rounded-lg',
                  TONES.success.bg,
                  TONES.success.text,
                )}
              >
                <Globe className="size-5" />
              </div>
              <div>
                <div className="text-warm-500 text-xs">LP Live</div>
                <div className="font-display text-warm-900 text-xl font-bold tabular-nums">
                  {publishedCount} / {pages.length}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3">
              <div className="bg-warm-100 text-warm-600 flex size-10 items-center justify-center rounded-lg">
                <Layers className="size-5" />
              </div>
              <div>
                <div className="text-warm-500 text-xs">LP Draft</div>
                <div className="font-display text-warm-900 text-xl font-bold tabular-nums">
                  {pages.length - publishedCount}
                </div>
              </div>
            </CardContent>
          </Card>
          {aiStats && aiStats.totalGenerations > 0 && (
            <Card
              className="bg-primary-50/40"
              title={`Total ${aiStats.totalGenerations} kali AI generate untuk landing page kamu.`}
            >
              <CardContent className="flex items-center gap-3">
                <div className="bg-primary-100 text-primary-600 flex size-10 items-center justify-center rounded-lg">
                  <Sparkles className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-warm-500 text-xs">
                    AI Generate · {aiStats.totalGenerations}×
                  </div>
                  <div className="font-display text-warm-900 text-xl font-bold tabular-nums">
                    {formatNumber(aiStats.audited.platformTokensCharged)}
                  </div>
                  <div className="text-warm-500 mt-0.5 text-xs">
                    token kepake total
                    {aiStats.legacy.count > 0 && (
                      <span className={cn('ml-0.5', TONES.warning.text)}>
                        *
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      {aiStats && aiStats.legacy.count > 0 && (
        <p className="text-warm-500 -mt-2 text-xs">
          *{aiStats.legacy.count} dari {aiStats.totalGenerations} generasi
          adalah data lama (sebelum 2026-05-09) — token tidak tercatat per-call.
        </p>
      )}

      {/* Info Quota */}
      {quota && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-warm-700 text-sm font-semibold">
                Kuota Paket Kamu
              </CardTitle>
              <Badge variant="outline" className="font-semibold">
                {TIER_LABEL[quota.tier]}
              </Badge>
            </div>
            <CardDescription className="text-warm-500 text-xs">
              Beli paket token untuk upgrade kuota otomatis.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="text-warm-500 flex items-center gap-1.5">
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
                <div className="text-warm-500 flex items-center gap-1.5">
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
        <CardGridSkeleton count={3} />
      ) : pages.length === 0 ? (
        <EmptyState
          bordered
          icon={Globe}
          title="Belum ada landing page"
          description="Buat halaman pertamamu untuk promosi atau funnel."
          action={
            <Button onClick={() => setCreateOpen(true)} disabled={lpFull}>
              <Plus className="mr-2 size-4" />
              Buat LP Pertama
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pages.map((lp) => {
            const publicPath = `/p/${lp.slug}`
            const fullUrl =
              typeof window !== 'undefined'
                ? `${window.location.origin}${publicPath}`
                : publicPath
            return (
              <Card key={lp.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={cn(
                        'flex size-10 items-center justify-center rounded-lg',
                        lp.isPublished
                          ? cn(TONES.success.bg, TONES.success.text)
                          : 'bg-primary-50 text-primary-600',
                      )}
                    >
                      <Globe className="size-5" />
                    </div>
                    {lp.isPublished ? (
                      <StatusBadge tone="success" label="Live" pulse />
                    ) : (
                      <StatusBadge tone="neutral" label="Draft" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-display text-warm-900 text-base font-semibold">
                      {lp.title}
                    </div>
                    <div className="text-warm-500 mt-0.5 truncate font-mono text-xs">
                      {publicPath}
                    </div>
                  </div>
                  <div className="text-warm-500 flex items-center gap-3 text-xs">
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
                  <div className="border-warm-100 flex items-center gap-1.5 border-t pt-3">
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
                    {/* Content Studio CTA — start dari LP, generate ide & konten. */}
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      title="Bikin konten promosi LP ini — Content Studio"
                      className="text-primary-700 hover:bg-primary-50"
                    >
                      <Link href={`/content?lpId=${lp.id}`}>
                        <Sparkles className="size-3.5" />
                      </Link>
                    </Button>
                    {lp.isPublished && (
                      <>
                        <Button asChild size="sm" className="flex-1">
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
                      onClick={() => setDeleteTarget(lp)}
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
        title="Hapus Landing Page?"
        description={
          <>
            Yakin mau hapus LP <strong>{deleteTarget?.title}</strong>? Semua
            gambar yang menempel di LP ini juga ikut dihapus. Tindakan ini tidak
            bisa dibatalkan.
          </>
        }
        isLoading={Boolean(deleteTarget) && deletingId === deleteTarget?.id}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
