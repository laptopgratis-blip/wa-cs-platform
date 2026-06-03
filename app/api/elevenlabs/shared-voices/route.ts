// GET  /api/elevenlabs/shared-voices?lang=id&gender=male — browse voice library
// POST /api/elevenlabs/shared-voices/add — add shared voice ke library user
//
// Pakai node:https (Node 22 fetch fails for ElevenLabs endpoints).

import * as https from 'node:https'

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { decrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

async function getKey(): Promise<string> {
  const row = await prisma.apiKey.findUnique({ where: { provider: 'ELEVENLABS' } })
  if (!row || !row.isActive) throw new Error('ELEVENLABS key belum di-set / non-aktif')
  return decrypt(row.apiKey).trim()
}

function elCall<T = unknown>(
  apiKey: string,
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'xi-api-key': apiKey,
      accept: 'application/json',
    }
    if (body) headers['content-type'] = 'application/json'
    const req = https.request(
      {
        hostname: 'api.elevenlabs.io',
        port: 443,
        path,
        method,
        family: 4,
        headers,
        timeout: 20_000,
      },
      (res) => {
        let raw = ''
        res.on('data', (c: Buffer) => {
          raw += c.toString('utf8')
        })
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) as T })
          } catch {
            resolve({ status: res.statusCode ?? 0, data: raw as unknown as T })
          }
        })
      },
    )
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('ElevenLabs timeout'))
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

export async function GET(req: Request) {
  try {
    await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const url = new URL(req.url)
  const lang = url.searchParams.get('lang') ?? 'id'
  const gender = url.searchParams.get('gender') ?? ''
  const pageSize = Math.min(50, Number(url.searchParams.get('pageSize') ?? '20'))
  const qs = new URLSearchParams({ language: lang, page_size: String(pageSize) })
  if (gender) qs.set('gender', gender)
  try {
    const apiKey = await getKey()
    const r = await elCall<{
      voices?: Array<{
        voice_id: string
        public_owner_id: string
        name: string
        gender?: string
        language?: string
        accent?: string
        descriptive?: string
        preview_url?: string
        free_users_allowed?: boolean
      }>
    }>(apiKey, `/v1/shared-voices?${qs.toString()}`)
    if (r.status >= 400) return jsonError(`ElevenLabs HTTP ${r.status}`, 500)
    return jsonOk({ voices: r.data.voices ?? [] })
  } catch (e) {
    return jsonError((e as Error).message, 500)
  }
}

export async function POST(req: Request) {
  try {
    await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const body = (await req.json().catch(() => null)) as {
    voiceId?: string
    publicOwnerId?: string
    newName?: string
  } | null
  if (!body?.voiceId || !body?.publicOwnerId) {
    return jsonError('voiceId + publicOwnerId wajib', 400)
  }
  const newName = body.newName?.trim().slice(0, 60) || 'ID Voice'
  try {
    const apiKey = await getKey()
    const r = await elCall<{ voice_id?: string }>(
      apiKey,
      `/v1/voices/add/${encodeURIComponent(body.publicOwnerId)}/${encodeURIComponent(body.voiceId)}`,
      'POST',
      { new_name: newName },
    )
    if (r.status >= 400 || !r.data.voice_id) {
      return jsonError(`Add gagal HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`, 500)
    }
    return jsonOk({ voiceId: r.data.voice_id, name: newName })
  } catch (e) {
    return jsonError((e as Error).message, 500)
  }
}
