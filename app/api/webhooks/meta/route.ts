// GET  /api/webhooks/meta — verifikasi webhook Meta (hub.challenge)
// POST /api/webhooks/meta — penerima event WhatsApp Cloud API
//
// KRITIS: signature X-Hub-Signature-256 dihitung dari RAW BODY persis —
// req.text() wajib dipanggil SEBELUM parse JSON apa pun.
// Balas 200 secepatnya (SLA Meta ±20 dtk); pemrosesan berjalan setelah
// respons via after(). Event yang gagal diproses TIDAK di-retry Meta
// (retry hanya untuk non-200) — dedup wamid membuat retry aman.
import { createHmac, timingSafeEqual } from 'node:crypto'

import { NextResponse, after } from 'next/server'

import { getMetaConfig } from '@/lib/services/waba/config'
import { processMetaWebhook } from '@/lib/services/waba/webhook-router'

const MAX_BODY_BYTES = 1_000_000 // 1 MB — payload webhook Meta jauh di bawah ini

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// Verifikasi subscription dari Meta dashboard ("Verify and save").
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  let verifyToken: string
  try {
    verifyToken = getMetaConfig().verifyToken
  } catch {
    return new NextResponse('webhook belum dikonfigurasi', { status: 503 })
  }

  if (mode === 'subscribe' && token && challenge && safeEqual(token, verifyToken)) {
    // Meta mengharapkan challenge dibalas sebagai plain text.
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse('verify token salah', { status: 403 })
}

export async function POST(req: Request) {
  let appSecret: string
  try {
    appSecret = getMetaConfig().appSecret
  } catch {
    return new NextResponse('webhook belum dikonfigurasi', { status: 503 })
  }

  // Raw body dulu — jangan sentuh req.json() sebelum signature diverifikasi.
  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_BYTES) {
    return new NextResponse('payload terlalu besar', { status: 413 })
  }

  const signature = req.headers.get('x-hub-signature-256') || ''
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
  if (!signature || !safeEqual(signature, expected)) {
    return new NextResponse('signature tidak valid', { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new NextResponse('body bukan JSON', { status: 400 })
  }

  const payload = body as import('@/lib/services/waba/types').WabaWebhookPayload
  if (payload.object !== 'whatsapp_business_account') {
    // Event non-WABA (mis. subscribe field lain) — ack saja.
    return NextResponse.json({ success: true })
  }

  // Ack cepat; proses setelah respons terkirim.
  after(async () => {
    try {
      await processMetaWebhook(payload)
    } catch (err) {
      // Jangan sampai unhandled rejection — cukup log; Meta tidak retry
      // event yang sudah di-ack, dedup wamid melindungi dari duplikat.
      console.error('[webhooks/meta] gagal memproses event:', err)
    }
  })

  return NextResponse.json({ success: true })
}
