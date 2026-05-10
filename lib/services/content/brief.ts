// CRUD ContentBrief + helper utility.
//
// Brief = batch container ContentPiece. Bisa dibuat 2 cara:
//   1. Dari ContentIdea hasil Idea Generator (selectedIdeaIds)
//   2. Brief manual (no LP, fields manualTitle/audience/offer)
//
// Status flow: DRAFT (sedang pilih ide) → GENERATING (AI run) → COMPLETED|FAILED
import { prisma } from '@/lib/prisma'

export interface FunnelMix {
  tofu: number
  mofu: number
  bofu: number
}

export const DEFAULT_FUNNEL_MIX: FunnelMix = { tofu: 4, mofu: 3, bofu: 3 }

export interface CreateBriefInput {
  userId: string
  lpId?: string
  manualTitle?: string
  manualAudience?: string
  manualOffer?: string
  tone?: 'CASUAL' | 'EDUKATIF' | 'AGGRESSIVE_OFFER' | 'STORYTELLING'
  funnelMix?: FunnelMix
}

export async function createBrief(input: CreateBriefInput) {
  // Validasi: lpId atau manual fields wajib salah satu.
  if (!input.lpId && !input.manualTitle) {
    throw new Error('Brief butuh lpId atau manualTitle minimal.')
  }
  if (input.lpId) {
    const lp = await prisma.landingPage.findFirst({
      where: { id: input.lpId, userId: input.userId },
      select: { id: true },
    })
    if (!lp) throw new Error('LP tidak ditemukan / bukan milik user.')
  }
  return prisma.contentBrief.create({
    data: {
      userId: input.userId,
      lpId: input.lpId ?? null,
      manualTitle: input.manualTitle ?? null,
      manualAudience: input.manualAudience ?? null,
      manualOffer: input.manualOffer ?? null,
      tone: input.tone ?? 'CASUAL',
      funnelMix: (input.funnelMix ?? DEFAULT_FUNNEL_MIX) as object,
      status: 'DRAFT',
    },
  })
}

export async function getBriefForOwner(userId: string, briefId: string) {
  return prisma.contentBrief.findFirst({
    where: { id: briefId, userId },
    include: {
      lp: { select: { id: true, title: true, slug: true } },
      pieces: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          channel: true,
          funnelStage: true,
          format: true,
          title: true,
          status: true,
          tokensCharged: true,
          createdAt: true,
        },
      },
    },
  })
}

export async function listBriefsForOwner(userId: string) {
  return prisma.contentBrief.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      lp: { select: { id: true, title: true, slug: true } },
      _count: { select: { pieces: true } },
    },
  })
}

export async function updateBriefStatus(
  briefId: string,
  status: 'DRAFT' | 'GENERATING' | 'COMPLETED' | 'FAILED',
  errorMessage?: string,
) {
  return prisma.contentBrief.update({
    where: { id: briefId },
    data: { status, errorMessage: errorMessage ?? null },
  })
}
