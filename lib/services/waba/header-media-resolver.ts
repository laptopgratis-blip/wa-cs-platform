// Siapkan media header template untuk KIRIM saat headerMediaUrl menunjuk CDN
// Meta (hasil sync). Pengunduh Meta menolak URL CDN-nya sendiri (131053 /
// 403), jadi media diunduh server kita lalu di-upload ke
// POST /{phoneNumberId}/media → dikirim sebagai `{ id }`.
//
// - Media id Meta berlaku ±30 hari → cache in-memory 6 jam per
//   (template, nomor pengirim, URL) + dedupe promise in-flight supaya
//   ratusan penerima broadcast paralel cukup SATU unduh + SATU upload.
// - Anti-SSRF: hanya host CDN Meta yang pernah diunduh (termasuk redirect).
// - URL contoh kedaluwarsa → refresh komponen template dari Graph, simpan URL
//   baru (hanya menimpa URL CDN, tak pernah URL publik hulao), unduh ulang.
// - Gagal dibedakan SEMENTARA (timeout/jaringan/5xx/429 — unduh, refresh, atau
//   upload) vs PERMANEN (URL kedaluwarsa & refresh tak menolong, jenis/ukuran
//   salah, upload ditolak 4xx). Sementara tidak memicu refresh dan tidak
//   menyuruh seller unggah ulang.
//
// Kontrak: NEVER throw.

import { graphRequest, type GraphResult } from './graph'
import {
  headerMediaRule,
  headerMediaTemporaryMessage,
  headerMediaUnavailableMessage,
  isMetaCdnUrl,
  isTransientGraphError,
  isTransientHttpStatus,
  mediaKindForHeader,
  resolveHeaderMediaMime,
  type HeaderMediaKind,
} from './header-media'
import { mediaUploadFileName, uploadCloudMedia } from './media-upload'
import { parseMetaComponents, type TemplateSendHeaderParam } from './template-payload'

const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const CACHE_MAX_ENTRIES = 500
const DOWNLOAD_TIMEOUT_MS = 20_000
const MAX_REDIRECTS = 3
const REFRESH_TIMEOUT_MS = 15_000

export interface HeaderMediaTemplateRef {
  id: string
  name?: string | null
  metaTemplateId: string | null
  headerType: string | null
  headerMediaUrl: string | null
}

export type HeaderMediaDownloadResult =
  | { ok: true; bytes: Buffer; contentType: string | null }
  /** `transient` eksplisit menang; tanpa itu diturunkan dari `status`. */
  | { ok: false; status?: number; transient?: boolean; error: string }

/** Hasil refresh komponen template dari Graph. */
export type HeaderRefreshResult =
  | { ok: true; url: string | null }
  | { ok: false; transient: boolean; error: string }

export interface HeaderMediaResolverDeps {
  download: (url: string, maxBytes: number) => Promise<HeaderMediaDownloadResult>
  /** URL contoh header terbaru dari Graph (`example.header_handle[0]`); url null bila tak ada. */
  fetchTemplateHeaderUrl: (metaTemplateId: string, token: string) => Promise<HeaderRefreshResult>
  /** Simpan URL baru — hanya bila nilai DB masih `oldUrl`. */
  saveTemplateHeaderUrl: (templateId: string, oldUrl: string, newUrl: string) => Promise<void>
  upload: (input: {
    phoneNumberId: string
    token: string
    buffer: Buffer
    mime: string
    filename?: string
  }) => Promise<GraphResult<{ id: string }>>
  now: () => number
}

export type HeaderMediaResolution =
  | { ok: true; header?: TemplateSendHeaderParam }
  /** transient=true → layak dicoba lagi (bukan salah template). */
  | { ok: false; error: string; transient: boolean }

interface CacheEntry {
  header: TemplateSendHeaderParam
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<HeaderMediaResolution>>()

/** Kosongkan cache & in-flight (untuk test). */
export function clearHeaderMediaCache(): void {
  cache.clear()
  inflight.clear()
}

function cacheKey(templateId: string, phoneNumberId: string, url: string): string {
  return `${templateId}|${phoneNumberId}|${url}`
}

function remember(key: string, header: TemplateSendHeaderParam, now: number): void {
  cache.delete(key)
  cache.set(key, { header, expiresAt: now + CACHE_TTL_MS })
  // Batasi ukuran: Map menjaga urutan sisip → hapus entri tertua.
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

// ── Default deps (jaringan & DB) ──

async function readBodyWithLimit(res: Response, maxBytes: number): Promise<Buffer | null> {
  if (!res.body) return Buffer.alloc(0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

/** Unduh dari CDN Meta (https saja, redirect diikuti manual & dicek host). */
async function downloadMetaCdnMedia(url: string, maxBytes: number): Promise<HeaderMediaDownloadResult> {
  try {
    const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
    let current = url
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (!isMetaCdnUrl(current) || new URL(current).protocol !== 'https:') {
        return { ok: false, transient: false, error: `host bukan CDN Meta (https): ${new URL(current).hostname}` }
      }
      const res = await fetch(current, { redirect: 'manual', signal, cache: 'no-store' })
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel().catch(() => undefined)
        const location = res.headers.get('location')
        if (!location) return { ok: false, status: res.status, error: `redirect ${res.status} tanpa Location` }
        current = new URL(location, current).toString()
        continue
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined)
        return { ok: false, status: res.status, error: `HTTP ${res.status}` }
      }
      const declared = Number(res.headers.get('content-length') ?? '')
      if (Number.isFinite(declared) && declared > maxBytes) {
        await res.body?.cancel().catch(() => undefined)
        return { ok: false, status: res.status, error: `ukuran ${declared} byte melebihi batas ${maxBytes}` }
      }
      const bytes = await readBodyWithLimit(res, maxBytes)
      if (!bytes) return { ok: false, status: res.status, error: `ukuran melebihi batas ${maxBytes} byte` }
      return { ok: true, bytes, contentType: res.headers.get('content-type') }
    }
    return { ok: false, transient: false, error: 'terlalu banyak redirect' }
  } catch (err) {
    // Timeout / jaringan → sementara.
    return { ok: false, transient: true, error: `unduh gagal: ${(err as Error).message}` }
  }
}

async function fetchTemplateHeaderUrlFromGraph(metaTemplateId: string, token: string): Promise<HeaderRefreshResult> {
  const res = await graphRequest<{ components?: unknown }>(
    `/${encodeURIComponent(metaTemplateId)}?fields=components`,
    { token, timeoutMs: REFRESH_TIMEOUT_MS },
  )
  if (!res.ok) {
    const code = res.error.code ? ` (code ${res.error.code})` : ''
    return { ok: false, transient: isTransientGraphError(res.error), error: `${res.error.message}${code}` }
  }
  return { ok: true, url: parseMetaComponents(res.data.components).headerMediaUrl }
}

async function saveTemplateHeaderUrlToDb(templateId: string, oldUrl: string, newUrl: string): Promise<void> {
  // Import malas: modul ini dipakai test tanpa DB.
  const { prisma } = await import('@/lib/prisma')
  // Bersyarat nilai lama — jangan menimpa URL publik hulao yang baru diunggah
  // seller di antara unduh dan simpan.
  await prisma.wabaTemplate.updateMany({
    where: { id: templateId, headerMediaUrl: oldUrl },
    data: { headerMediaUrl: newUrl },
  })
}

const DEFAULT_DEPS: HeaderMediaResolverDeps = {
  download: downloadMetaCdnMedia,
  fetchTemplateHeaderUrl: fetchTemplateHeaderUrlFromGraph,
  saveTemplateHeaderUrl: saveTemplateHeaderUrlToDb,
  upload: uploadCloudMedia,
  now: () => Date.now(),
}

// ── Resolver ──

interface ResolveContext {
  template: HeaderMediaTemplateRef
  kind: HeaderMediaKind
  url: string
  phoneNumberId: string
  token: string
  deps: HeaderMediaResolverDeps
}

/** Gagal sementara (coba lagi) vs permanen (seller harus memperbaiki template). */
function fail(ctx: ResolveContext, detail: string, transient: boolean, message?: string): HeaderMediaResolution {
  console.error(
    `[waba/header-media] template ${ctx.template.id} (${ctx.template.name ?? '-'}) ` +
      `nomor ${ctx.phoneNumberId}: ${detail} [${transient ? 'sementara' : 'permanen'}]`,
  )
  const fallback = transient ? headerMediaTemporaryMessage(ctx.kind) : headerMediaUnavailableMessage(ctx.kind)
  return { ok: false, transient, error: message ?? fallback }
}

function downloadFailureIsTransient(r: { status?: number; transient?: boolean }): boolean {
  return r.transient ?? isTransientHttpStatus(r.status)
}

type DownloadOutcome =
  | { ok: true; bytes: Buffer; contentType: string | null; url: string }
  | { ok: false; detail: string; transient: boolean }

/**
 * Unduh URL; bila gagal PERMANEN (403/410 — URL contoh kedaluwarsa), refresh
 * URL dari Graph lalu unduh ulang sekali. Gagal sementara langsung
 * dikembalikan: refresh tak menolong, URL yang sama layak dicoba lagi nanti.
 */
async function downloadWithRefresh(ctx: ResolveContext): Promise<DownloadOutcome> {
  const { deps, template } = ctx
  const maxBytes = headerMediaRule(ctx.kind).maxBytes
  const first = await deps.download(ctx.url, maxBytes)
  if (first.ok) return { ...first, url: ctx.url }

  const firstDetail = `unduh ${ctx.url.split('?')[0]} gagal (${first.error})`
  if (downloadFailureIsTransient(first)) return { ok: false, transient: true, detail: firstDetail }
  if (!template.metaTemplateId) {
    return { ok: false, transient: false, detail: `${firstDetail}; template tanpa metaTemplateId` }
  }
  const refreshed = await deps.fetchTemplateHeaderUrl(template.metaTemplateId, ctx.token)
  if (!refreshed.ok) {
    return { ok: false, transient: refreshed.transient, detail: `${firstDetail}; refresh Graph gagal (${refreshed.error})` }
  }
  const fresh = refreshed.url
  if (!fresh) return { ok: false, transient: false, detail: `${firstDetail}; refresh Graph tak memberi URL contoh` }
  if (!isMetaCdnUrl(fresh)) return { ok: false, transient: false, detail: `${firstDetail}; URL refresh bukan CDN Meta` }
  if (fresh === ctx.url) return { ok: false, transient: false, detail: `${firstDetail}; URL refresh sama` }

  try {
    await deps.saveTemplateHeaderUrl(template.id, ctx.url, fresh)
  } catch (err) {
    // Tidak fatal — kirim tetap bisa memakai URL baru di memori.
    console.error(`[waba/header-media] simpan URL baru template ${template.id} gagal:`, err)
  }
  const second = await deps.download(fresh, maxBytes)
  if (!second.ok) {
    return {
      ok: false,
      transient: downloadFailureIsTransient(second),
      detail: `${firstDetail}; unduh ulang gagal (${second.error})`,
    }
  }
  return { ...second, url: fresh }
}

async function resolveFresh(ctx: ResolveContext, key: string): Promise<HeaderMediaResolution> {
  const dl = await downloadWithRefresh(ctx)
  if (!dl.ok) return fail(ctx, dl.detail, dl.transient)

  const rule = headerMediaRule(ctx.kind)
  if (dl.bytes.length === 0 || dl.bytes.length > rule.maxBytes) {
    return fail(ctx, `ukuran media ${dl.bytes.length} byte di luar batas ${rule.maxBytes}`, false)
  }
  const mime = resolveHeaderMediaMime(ctx.kind, dl.contentType, dl.bytes)
  if (!mime) {
    return fail(ctx, `jenis media tidak cocok header ${ctx.kind} (content-type ${dl.contentType ?? '-'})`, false)
  }

  const filename = ctx.kind === 'document' && ctx.template.name ? mediaUploadFileName(mime, ctx.template.name) : undefined
  const up = await ctx.deps.upload({
    phoneNumberId: ctx.phoneNumberId,
    token: ctx.token,
    buffer: dl.bytes,
    mime,
    ...(filename ? { filename } : {}),
  })
  if (!up.ok) {
    // 5xx/429/timeout/kode rate-limit = gangguan Meta → coba lagi; 4xx lain
    // (format/param ditolak) tak sembuh dengan retry → unggah ulang media.
    const transient = isTransientGraphError(up.error)
    return fail(
      ctx,
      `upload media ke Meta gagal: ${up.error.message}${up.error.code ? ` (code ${up.error.code})` : ''}`,
      transient,
      transient ? `${rule.label} header template gagal diunggah ke Meta — coba lagi beberapa saat lagi` : undefined,
    )
  }

  const header: TemplateSendHeaderParam = { type: ctx.kind, mediaId: up.data.id, ...(filename ? { filename } : {}) }
  const now = ctx.deps.now()
  remember(key, header, now)
  if (dl.url !== ctx.url) remember(cacheKey(ctx.template.id, ctx.phoneNumberId, dl.url), header, now)
  return { ok: true, header }
}

/**
 * Header siap kirim untuk template ber-header media. `{ ok:true }` tanpa
 * header = biarkan buildSendComponents memakai link apa adanya (header non-
 * media, atau URL publik hulao). NEVER throw.
 */
export async function resolveTemplateHeaderMedia(input: {
  template: HeaderMediaTemplateRef
  phoneNumberId: string
  token: string
  deps?: Partial<HeaderMediaResolverDeps>
}): Promise<HeaderMediaResolution> {
  const kind = mediaKindForHeader(input.template.headerType)
  if (!kind) return { ok: true }
  const url = input.template.headerMediaUrl?.trim()
  if (!url || !isMetaCdnUrl(url)) return { ok: true }

  const ctx: ResolveContext = {
    template: input.template,
    kind,
    url,
    phoneNumberId: input.phoneNumberId,
    token: input.token,
    deps: { ...DEFAULT_DEPS, ...input.deps },
  }
  try {
    const key = cacheKey(input.template.id, input.phoneNumberId, url)
    const hit = cache.get(key)
    if (hit && hit.expiresAt > ctx.deps.now()) return { ok: true, header: hit.header }
    if (hit) cache.delete(key)

    const pending = inflight.get(key)
    if (pending) return await pending
    const promise = resolveFresh(ctx, key)
      .catch((err: unknown) => fail(ctx, `error tak terduga: ${(err as Error).message}`, true))
      .finally(() => inflight.delete(key))
    inflight.set(key, promise)
    return await promise
  } catch (err) {
    // Tak terduga ≠ bukti template rusak → sementara (follow-up dibatasi MAX_SEND_RETRY).
    return fail(ctx, `error tak terduga: ${(err as Error).message}`, true)
  }
}
