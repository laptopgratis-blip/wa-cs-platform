// Cache in-memory untuk window event /api/live/[slug]/feed — endpoint ini
// di-poll tiap beberapa detik oleh SETIAP device penonton dengan parameter
// `since`/`excludeSession` yang berbeda-beda, jadi response-nya tidak bisa
// di-cache utuh. Yang di-cache adalah WINDOW event 60dtk terakhir per room;
// filter since/excludeSession/limit dilakukan in-memory per request.
// Hasil: berapa pun jumlah viewer, query Postgres maksimal 1× per room per
// TTL (insiden 2026-06-10: ratusan viewer broadcast → puluhan query feed
// per detik ikut menjatuhkan server 2 vCPU).
//
// Single-flight: request yang datang saat cache miss berbagi 1 promise query
// yang sama — mencegah stampede saat TTL habis di tengah trafik tinggi.
//
// Catatan: process-local, sama seperti stage-cache.ts — valid karena prod
// jalan 1 instance. Tidak ada invalidasi saat pesan baru masuk; staleness
// maksimal TTL (~2dtk) masih di bawah interval poll klien (4dtk).
import { prisma } from '@/lib/prisma'

export interface FeedCacheEvent {
  id: string
  type: string
  payload: unknown
  createdAt: Date
  liveSession: {
    clientSessionId: string
    customerName: string | null
  }
}

export interface FeedSnapshot {
  roomId: string
  isActive: boolean
  events: FeedCacheEvent[] // ascending by createdAt, window 60dtk terakhir
}

const TTL_MS = 2000
const WINDOW_MS = 60_000
// Cap jumlah event di window — room sangat ramai tetap bounded.
const WINDOW_CAP = 200

// null = negative cache (room tidak ditemukan) — slug acak tidak tembus DB.
const bySlug = new Map<string, { snap: FeedSnapshot | null; expiresAt: number }>()
const inflight = new Map<string, Promise<FeedSnapshot | null>>()

async function queryWindow(slug: string): Promise<FeedSnapshot | null> {
  const room = await prisma.liveRoom.findUnique({
    where: { slug },
    select: { id: true, isActive: true },
  })
  if (!room) return null
  if (!room.isActive) {
    return { roomId: room.id, isActive: false, events: [] }
  }

  // Ambil event terbaru dulu (desc + cap) lalu balik ke ascending — kalau
  // window berisi > cap, yang terpotong adalah event paling lama.
  const events = await prisma.liveEvent.findMany({
    where: {
      liveSession: { liveRoomId: room.id },
      type: { in: ['USER_MESSAGE', 'AI_MESSAGE'] },
      createdAt: { gt: new Date(Date.now() - WINDOW_MS) },
    },
    orderBy: { createdAt: 'desc' },
    take: WINDOW_CAP,
    select: {
      id: true,
      type: true,
      payload: true,
      createdAt: true,
      liveSession: {
        select: {
          clientSessionId: true,
          customerName: true,
        },
      },
    },
  })
  events.reverse()
  return { roomId: room.id, isActive: true, events }
}

export async function getFeedWindow(slug: string): Promise<FeedSnapshot | null> {
  const hit = bySlug.get(slug)
  if (hit && hit.expiresAt > Date.now()) return hit.snap

  const pending = inflight.get(slug)
  if (pending) return pending

  const p = queryWindow(slug)
    .then((snap) => {
      bySlug.set(slug, { snap, expiresAt: Date.now() + TTL_MS })
      return snap
    })
    .finally(() => {
      inflight.delete(slug)
    })
  inflight.set(slug, p)
  return p
}
