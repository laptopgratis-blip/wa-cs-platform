'use client'

// Port dari siska-ai/public/index.html (dual-frame avatar+chat layout) ke
// React. State machine video disederhanakan: PR-0b cuma satu loop video
// (HostTemplate cuma punya 1 MP4). Indicator "thinking/talking" via overlay UI.
//
// PR-0c (Tangkap): track clientSessionId di sessionStorage, kirim ke
// /chat & /event. Tombol "Order via WA" tampil setelah ≥3 turn — lead
// capture handoff ke wa-service Hulao.
//
// Audio queue: TTS hasil per kalimat di-play berurutan. Saat playing, video
// tetap loop (no lip-sync per kata — di handphone aman, di mobile UX live shop).
import { CheckCircle2, HelpCircle, Loader2, MessageSquare, MicOff, Send, ShoppingCart, Volume2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface Product {
  id: string
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  // Flash sale — diisi server-side kalau produk lagi aktif promo & dalam window.
  // Kalau null/undefined → tidak ada flash sale, tampil harga normal.
  flashSalePrice?: number | null
  flashSaleEndAt?: string | null // ISO string
  flashSaleQuota?: number | null
  flashSaleSold?: number | null
}

interface Scene {
  id: string
  name: string
  category: string // 'idle' | 'greeting' | 'listening' | 'thinking' | 'talking' | 'excited' | 'product'
  videoUrl: string
  isPrimary: boolean
}

interface BotConfig {
  enabled: boolean
  intervalMinSec: number
  intervalMaxSec: number
  prompts: string[]
}

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  text: string
  audioUrls?: string[]
  // Display name overlay — bot punya nama random viewer, user kosong, host pakai hostName.
  viewerName?: string
  // Created at — untuk timestamp overlay (relatif waktu).
  createdAt: number
  isBot?: boolean
}

interface SentenceWithAudio {
  text: string
  audioUrl: string | null
}

type LiveState = 'greeting' | 'idle' | 'listening' | 'thinking' | 'talking'

// Pool nama viewer untuk bot — campur Indonesian friendly + masking
const BOT_VIEWER_NAMES = [
  'Bu Yanti',
  'Pak Hendra',
  'Mbak Sari',
  'Dewi K.',
  'Ari S.',
  'Rina',
  'Bu Linda',
  'Pak Roni',
  'Aisyah',
  'Bunda Tika',
  'Pak Heru',
  'Mas Bayu',
  'Cici T.',
  'Ibu Wati',
  'Adit',
  'Mbak Putri',
  'Pak Yusuf',
  'Diana K.',
  'Bu Sinta',
  'Reza',
]

function pickRandomViewerName(): string {
  return BOT_VIEWER_NAMES[Math.floor(Math.random() * BOT_VIEWER_NAMES.length)]
}

export function LiveRoomView({
  slug,
  name,
  greeting,
  hostName,
  videoLoopUrl,
  hostMode = 'TTS_GENERATIVE',
  idleClipUrl = null,
  idleClips = [],
  scenes,
  products,
  botConfig,
  orderFormSlug,
  ttsPauseMs = 150,
}: {
  slug: string
  name: string
  greeting: string | null
  hostName: string
  videoLoopUrl: string
  hostMode?: 'TTS_GENERATIVE' | 'NATIVE_LIBRARY'
  idleClipUrl?: string | null
  // Array semua idle clip untuk rotation (NATIVE_LIBRARY mode).
  // Setiap kali clip jawaban habis → pilih idle clip berikutnya secara round-robin.
  // Kalau cuma 1 idle clip → loop yg sama (graceful fallback).
  idleClips?: Array<{ videoUrl: string; durationMs: number | null }>
  scenes: Scene[]
  products: Product[]
  botConfig?: BotConfig
  orderFormSlug?: string | null
  ttsPauseMs?: number
}) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [sending, setSending] = useState(false)
  const [muted, setMuted] = useState(false)
  const [talking, setTalking] = useState(false) // audio sedang main

  const [clientSessionId, setClientSessionId] = useState<string | null>(null)
  const [identity, setIdentity] = useState<{ name: string; phone: string } | null>(null)
  const [lastClickedProductId, setLastClickedProductId] = useState<string | null>(null)
  const [showLeadForm, setShowLeadForm] = useState(false)
  // Bottom-sheet "Belanja" — TikTok-style product drawer dipicu FAB keranjang.
  const [showProducts, setShowProducts] = useState(false)
  const [leadStatus, setLeadStatus] = useState<
    'idle' | 'submitting' | 'HANDOFF_SENT' | 'HANDOFF_FAILED' | 'error'
  >('idle')

  // State machine — gerakan host disesuaikan dengan kondisi chat.
  const [liveState, setLiveState] = useState<LiveState>('idle')

  // Double-buffer video swap untuk transisi smooth (cross-fade 200ms).
  // 2 <video> element overlap di absolute position. Yang aktif = visible
  // (opacity 1), yang inactive = preload buffer (opacity 0). Saat scene
  // swap: load new URL ke inactive layer → tunggu onLoadedData → flip
  // active flag (CSS transition opacity) → hidden layer di-pause.
  const [urlA, setUrlA] = useState<string>(videoLoopUrl)
  const [urlB, setUrlB] = useState<string>('')
  const [activeLayer, setActiveLayer] = useState<'A' | 'B'>('A')
  const activeUrl = activeLayer === 'A' ? urlA : urlB

  const videoARef = useRef<HTMLVideoElement | null>(null)
  const videoBRef = useRef<HTMLVideoElement | null>(null)
  // Track URL terakhir yang di-set ke INACTIVE layer — supaya onLoadedData
  // tidak misfire untuk re-render redundant.
  const pendingUrlRef = useRef<string | null>(null)
  // Idle rotation cursor (NATIVE_LIBRARY mode). ref bukan state karena gak
  // perlu trigger re-render — cuma dibaca di onEnded. Start dari 0 = idleClips[0]
  // yang udah dipakai initial videoLoopUrl, jadi next cycle pakai index 1.
  const idleRotationIdxRef = useRef(0)
  const getNextIdleUrl = useCallback((): string | null => {
    if (idleClips.length === 0) return idleClipUrl
    idleRotationIdxRef.current = (idleRotationIdxRef.current + 1) % idleClips.length
    return idleClips[idleRotationIdxRef.current]?.videoUrl ?? idleClipUrl
  }, [idleClips, idleClipUrl])
  const audioQueueRef = useRef<string[]>([])
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const greetingShownRef = useRef(false)
  // Poll feed dari semua user di room (shared chat). Track timestamp last
  // event yg sudah diterima supaya gak duplicate.
  const lastFeedAtRef = useRef<number>(Date.now())
  const seenEventIdsRef = useRef<Set<string>>(new Set())

  // Group scenes by category — pakai useMemo? Sederhana via lazy build.
  const scenesByCategory = useRef<Map<string, Scene[]> | null>(null)
  if (scenesByCategory.current === null) {
    const m = new Map<string, Scene[]>()
    for (const s of scenes) {
      const list = m.get(s.category) ?? []
      list.push(s)
      m.set(s.category, list)
    }
    scenesByCategory.current = m
  }

  // Pick scene URL untuk state tertentu. Logic:
  //   1. Cari scene di kategori target → random pick (rotasi).
  //   2. Fallback ke 'idle' kalau target kosong.
  //   3. Fallback ke videoLoopUrl (primary cache di HostTemplate) kalau idle juga kosong.
  // Return null kalau benar-benar tidak ada video sama sekali.
  const pickSceneUrl = useCallback(
    (category: LiveState, excludeUrl?: string): string | null => {
      const cats = scenesByCategory.current!
      let pool = cats.get(category) ?? []
      if (pool.length === 0 && category !== 'idle') {
        pool = cats.get('idle') ?? []
      }
      if (pool.length === 0) return videoLoopUrl ?? null
      const candidates = excludeUrl
        ? pool.filter((s) => s.videoUrl !== excludeUrl)
        : pool
      const picked =
        candidates.length > 0
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : pool[0]
      return picked?.videoUrl ?? null
    },
    [videoLoopUrl],
  )

  // Imperative initial src + autoplay untuk layer A pas mount.
  useEffect(() => {
    const v = videoARef.current
    if (!v || !urlA) return
    v.src = urlA
    v.load()
    v.play().catch(() => {})
    // Only mount-time, urlA selanjutnya ke-handle via setUrlA + onLoadedData B
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Switch scene ke URL baru. Logic:
  //   1. Same as active URL → restart active (currentTime=0) — pool tunggal.
  //   2. Same as INACTIVE layer URL → buffer sudah loaded, langsung restart
  //      + flip activeLayer (tanpa setUrl, supaya React tidak skip re-render
  //      saat URL alternate). Fix bug freeze pas pool 2 scene alternating.
  //   3. URL baru beneran → set inactive layer's URL, onLoadedData flip.
  // playSafe: try unmuted play (sesuai prop muted). Kalau browser block
  // autoplay (NATIVE_LIBRARY mode: video punya audio bonded), fallback: force
  // v.muted=true → replay (always succeeds) → setAudioBlocked(true) supaya
  // overlay "Klik untuk dengar" muncul. Saat user klik → unlockAudio +
  // unmuteVideos jalan, suara hidup.
  const playSafe = useCallback((v: HTMLVideoElement | null) => {
    if (!v) return
    const p = v.play()
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // Autoplay rejected. Forcibly mute video element (gak ubah React state
        // 'muted' user — kalau user mau dengar, klik overlay).
        try {
          v.muted = true
          v.play().catch(() => {})
          setAudioBlocked(true)
        } catch {
          /* ignore */
        }
      })
    }
  }, [])

  const switchToUrl = useCallback(
    (newUrl: string | null) => {
      if (!newUrl) return
      if (newUrl === activeUrl) {
        const v = activeLayer === 'A' ? videoARef.current : videoBRef.current
        if (v) {
          v.currentTime = 0
          playSafe(v)
        }
        return
      }
      const inactiveUrl = activeLayer === 'A' ? urlB : urlA
      if (newUrl === inactiveUrl) {
        const inactiveV =
          activeLayer === 'A' ? videoBRef.current : videoARef.current
        if (inactiveV) {
          inactiveV.currentTime = 0
          playSafe(inactiveV)
        }
        const newActive: 'A' | 'B' = activeLayer === 'A' ? 'B' : 'A'
        setActiveLayer(newActive)
        const oldV =
          activeLayer === 'A' ? videoARef.current : videoBRef.current
        setTimeout(() => oldV?.pause(), 250)
        return
      }
      pendingUrlRef.current = newUrl
      if (activeLayer === 'A') setUrlB(newUrl)
      else setUrlA(newUrl)
    },
    [activeLayer, activeUrl, urlA, urlB, playSafe],
  )

  // Apply scene change ketika liveState berubah — HANYA untuk TTS_GENERATIVE.
  // NATIVE_LIBRARY tidak pakai scene library; dispatchChat langsung handle
  // switchToUrl ke clip.videoUrl, onEnded handle swap balik ke idleClipUrl.
  // Effect ini kalau jalan di NATIVE_LIBRARY = race condition overwrite clip
  // URL dengan baseline scene → host idle terus, klip gak ke-play.
  useEffect(() => {
    if (hostMode === 'NATIVE_LIBRARY') return
    const url = pickSceneUrl(liveState, activeUrl)
    if (url && url !== activeUrl) {
      switchToUrl(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState, hostMode])

  // Saat inactive layer selesai loadedData (frame pertama ready) → flip
  // visibility. Cross-fade CSS 200ms bridge sisanya.
  const handleLayerLoaded = useCallback(
    (which: 'A' | 'B') => {
      if (which === activeLayer) return // active load (initial), ignore
      const v = which === 'A' ? videoARef.current : videoBRef.current
      if (!v) return
      v.currentTime = 0
      playSafe(v)
      setActiveLayer(which)
      const oldVid = which === 'A' ? videoBRef.current : videoARef.current
      setTimeout(() => oldVid?.pause(), 250)
    },
    [activeLayer, playSafe],
  )

  // Swap scene tiap video clip selesai (onEnded handler di bawah). Pool harus
  // punya >1 scene di kategori aktif, kalau cuma 1 → ya tetap sama (loop).
  // Note: replaced setTimeout-based rotation supaya scene gak terulang clip
  // identik sebelum pindah — sekarang tiap akhir clip = ganti scene.
  // (idleRotationTimerRef tidak dipakai lagi.)

  // Poll shared chat feed tiap 2.5dtk — merge USER/AI msg dari viewer lain.
  // Bot lokal tetap di-handle client-side terpisah.
  useEffect(() => {
    if (!clientSessionId) return
    const POLL_MS = 2500
    let cancelled = false
    async function poll() {
      try {
        const url = `/api/live/${encodeURIComponent(slug)}/feed?since=${lastFeedAtRef.current}&excludeSession=${encodeURIComponent(clientSessionId!)}&limit=30`
        const res = await fetch(url)
        if (!res.ok) return
        const json = (await res.json()) as {
          success: boolean
          data?: {
            events: Array<{
              id: string
              type: 'USER_MESSAGE' | 'AI_MESSAGE'
              text: string
              customerName: string | null
              isBot?: boolean
              clientSessionId: string
              createdAt: number
            }>
            now: number
          }
        }
        if (cancelled) return
        if (!json.success || !json.data) return
        const events = json.data.events
        if (events.length === 0) {
          lastFeedAtRef.current = json.data.now
          return
        }
        const newMsgs: ChatMsg[] = []
        for (const ev of events) {
          if (seenEventIdsRef.current.has(ev.id)) continue
          seenEventIdsRef.current.add(ev.id)
          newMsgs.push({
            id: `feed-${ev.id}`,
            role: ev.type === 'USER_MESSAGE' ? 'user' : 'assistant',
            text: ev.text,
            viewerName:
              ev.type === 'USER_MESSAGE'
                ? ev.customerName ?? 'Anonim'
                : undefined,
            createdAt: ev.createdAt,
            isBot: ev.isBot ?? false,
          })
        }
        if (newMsgs.length > 0) {
          setMessages((prev) => {
            // Sisipkan in chronological order (semua sudah sorted ASC).
            return [...prev, ...newMsgs]
          })
        }
        lastFeedAtRef.current = events[events.length - 1]!.createdAt
      } catch {
        /* swallow — polling, akan retry */
      }
    }
    void poll()
    const t = setInterval(() => void poll(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [clientSessionId, slug])

  // Greeting one-shot di mount (kalau ada scene kategori greeting + greeting text)
  useEffect(() => {
    if (greetingShownRef.current) return
    if (!greeting) return
    const greetPool = scenesByCategory.current?.get('greeting') ?? []
    if (greetPool.length === 0) return
    greetingShownRef.current = true
    setLiveState('greeting')
    const t = setTimeout(() => setLiveState('idle'), 6000)
    return () => clearTimeout(t)
  }, [greeting])

  // Listening state — user lagi ngetik (debounced). Lompat ke 'listening' saat
  // input berubah dari idle, balik ke idle setelah 1.5dtk gak ngetik.
  const listenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!input || sending) return
    // Only trigger kalau lagi idle (jangan interupt talking/thinking).
    setLiveState((prev) => (prev === 'idle' ? 'listening' : prev))
    if (listenTimerRef.current) clearTimeout(listenTimerRef.current)
    listenTimerRef.current = setTimeout(() => {
      setLiveState((prev) => (prev === 'listening' ? 'idle' : prev))
    }, 1500)
    return () => {
      if (listenTimerRef.current) clearTimeout(listenTimerRef.current)
    }
  }, [input, sending])

  // Generate/restore clientSessionId di sessionStorage (per tab).
  // Identity (name + phone) — disimpan localStorage (persist antar tab close).
  useEffect(() => {
    const sidKey = `live:session:${slug}`
    let id = sessionStorage.getItem(sidKey)
    if (!id) {
      id =
        (globalThis.crypto?.randomUUID?.() ??
          `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
      sessionStorage.setItem(sidKey, id)
    }
    setClientSessionId(id)
    const identKey = `live:identity:${slug}`
    const raw = localStorage.getItem(identKey)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { name: string; phone: string }
        if (parsed.name && parsed.phone) setIdentity(parsed)
      } catch {
        /* invalid JSON — ignore */
      }
    }
  }, [slug])

  // Greeting message — tampil sebagai 1st assistant msg.
  useEffect(() => {
    if (greeting && messages.length === 0) {
      setMessages([
        {
          id: 'greeting',
          role: 'assistant',
          text: greeting,
          createdAt: Date.now(),
        },
      ])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greeting])


  // Mute handler.
  useEffect(() => {
    if (currentAudioRef.current) currentAudioRef.current.muted = muted
  }, [muted])

  // Track autoplay-block state — kalau true, render "Klik untuk suara" prompt.
  const [audioBlocked, setAudioBlocked] = useState(false)

  const playNextAudio = useCallback(() => {
    if (muted) {
      audioQueueRef.current = []
      setTalking(false)
      setLiveState((prev) => (prev === 'talking' ? 'idle' : prev))
      return
    }
    const next = audioQueueRef.current.shift()
    if (!next) {
      setTalking(false)
      currentAudioRef.current = null
      setLiveState((prev) => (prev === 'talking' ? 'idle' : prev))
      return
    }
    const audio = new Audio(next)
    audio.muted = muted
    audio.preload = 'auto'
    currentAudioRef.current = audio
    setTalking(true)
    setLiveState('talking')
    audio.addEventListener('ended', () => {
      if (ttsPauseMs > 0) {
        setTimeout(() => playNextAudio(), ttsPauseMs)
      } else {
        playNextAudio()
      }
    })
    audio.addEventListener('error', (e) => {
      console.warn('[live-audio] play error', next, e)
      playNextAudio()
    })
    audio.play().catch((err) => {
      // Browser autoplay policy: butuh user gesture. Bukan diam-diam skip —
      // simpan queue + tampilkan prompt "Klik untuk suara", lalu user 1x klik
      // = unlock semua audio berikutnya juga (browser ngasih lifetime grant).
      console.warn('[live-audio] autoplay-blocked', err)
      // Kembalikan URL ini ke depan queue supaya dimainkan lagi setelah unlock.
      audioQueueRef.current.unshift(next)
      currentAudioRef.current = null
      setAudioBlocked(true)
      // Jangan set idle — biarkan state stay 'talking' supaya scene video tetap
      // talking saat user akhirnya klik unlock.
    })
  }, [muted, ttsPauseMs])

  // User klik prompt unlock — flush queue dengan gesture context.
  // Untuk NATIVE_LIBRARY: ALSO unmute video elements yang sebelumnya force-muted
  // oleh playSafe karena autoplay block, lalu replay.
  const unlockAudio = useCallback(() => {
    setAudioBlocked(false)
    // Unmute video element (force) — kalau user mau muted, mereka klik tombol mute terpisah.
    if (hostMode === 'NATIVE_LIBRARY') {
      const va = videoARef.current
      const vb = videoBRef.current
      const activeV = activeLayer === 'A' ? va : vb
      if (va) va.muted = muted
      if (vb) vb.muted = muted
      if (activeV) {
        // Replay active layer dari posisi sekarang (gak rewind) supaya audio mulai
        activeV.play().catch(() => {})
      }
    }
    if (audioQueueRef.current.length > 0 && !currentAudioRef.current) {
      playNextAudio()
    }
  }, [playNextAudio, hostMode, activeLayer, muted])

  const enqueueAudio = useCallback(
    (urls: string[]) => {
      audioQueueRef.current.push(...urls)
      if (!currentAudioRef.current) playNextAudio()
    },
    [playNextAudio],
  )

  // Track last REAL user message untuk pause bot.
  const lastRealUserAtRef = useRef<number>(0)

  // Core dispatcher — handle both real user + bot input.
  const dispatchChat = useCallback(
    async (input: { text: string; isBot?: boolean; viewerName?: string }) => {
      if (!clientSessionId) return
      const msg = input.text.trim()
      if (!msg) return
      if (input.isBot && sending) return // bot tunggu giliran kalau lagi proses
      const userMsgId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const viewer = input.viewerName ?? (input.isBot ? pickRandomViewerName() : undefined)
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: 'user',
          text: msg,
          viewerName: viewer,
          createdAt: Date.now(),
          isBot: input.isBot,
        },
      ])
      if (!input.isBot) lastRealUserAtRef.current = Date.now()
      setSending(true)
      setLiveState('thinking')
      try {
        // History: prefix nama viewer di setiap msg user supaya Claude tahu
        // pesan mana dari bot dan mana dari customer asli. Tanpa ini, semua
        // user-msg terlihat "anonymous" dan Claude ngasih balasan ke nama
        // customer asli walau yang baru aja nanya bot lain.
        const history = messages
          .filter((m) => m.id !== 'greeting')
          .slice(-12)
          .map((m) => {
            if (m.role === 'user') {
              const name = m.viewerName ?? identity?.name ?? 'anonim'
              return { role: m.role, content: `(${name}) ${m.text}` }
            }
            return { role: m.role, content: m.text }
          })
        // Asker = bot viewer name (kalau isBot) ATAU identitas customer asli.
        // Backend pakai ini sebagai customerName ke Claude.
        const askerName = input.isBot ? viewer : identity?.name
        const askerPhone = input.isBot ? undefined : identity?.phone
        const res = await fetch(`/api/live/${encodeURIComponent(slug)}/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message: msg,
            history,
            clientSessionId,
            customerName: askerName,
            customerPhone: askerPhone,
            isBot: Boolean(input.isBot),
          }),
        })
        const json = (await res.json()) as {
          success: boolean
          data?:
            | { mode: 'tts'; reply: string; sentences: SentenceWithAudio[]; tokensCharged: number }
            | {
                mode: 'clip'
                clip: {
                  id: string
                  videoUrl: string
                  audioUrl: string | null
                  transcript: string
                  category: string
                  durationMs: number | null
                  confidence: number
                  isFallback: boolean
                }
              }
            | { mode: 'text-only'; reply: string; sentences: SentenceWithAudio[]; tokensCharged: number }
          error?: string
        }
        if (!json.success || !json.data) {
          setMessages((prev) => [
            ...prev,
            {
              id: `e-${Date.now()}`,
              role: 'assistant',
              text: `⚠️ ${json.error ?? 'Gagal balas — coba lagi'}`,
              createdAt: Date.now(),
            },
          ])
          return
        }

        // ──────────────────────────────────────────
        // SPRINT 4: NATIVE_LIBRARY mode response
        // ──────────────────────────────────────────
        if (json.data.mode === 'clip') {
          const clip = json.data.clip
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              text: clip.transcript,
              createdAt: Date.now(),
            },
          ])
          // Swap video URL ke matched clip. Audio inline (gak ada audioUrls queue).
          // Existing switchToUrl reuse — dual buffer A/B handle cross-fade.
          setLiveState('talking')
          switchToUrl(clip.videoUrl)
          return
        }

        // TTS atau text-only response (existing flow)
        const reply = json.data.reply ?? ''
        const sentences = ('sentences' in json.data ? json.data.sentences : []) as SentenceWithAudio[]
        const audioUrls = sentences
          .map((s) => s.audioUrl)
          .filter((u): u is string => Boolean(u))
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: reply,
            audioUrls,
            createdAt: Date.now(),
          },
        ])
        if (audioUrls.length > 0) {
          setLiveState('talking')
          enqueueAudio(audioUrls)
        } else {
          setLiveState('talking')
          setTimeout(() => {
            setLiveState((prev) => (prev === 'talking' ? 'idle' : prev))
          }, 2500)
        }
      } finally {
        setSending(false)
      }
    },
    [sending, slug, messages, enqueueAudio, clientSessionId, switchToUrl],
  )

  const send = useCallback(async () => {
    const msg = input.trim()
    if (!msg || sending) return
    setInput('')
    await dispatchChat({ text: msg, isBot: false })
  }, [input, sending, dispatchChat])

  // Bot timer — pick random prompt tiap interval. Pause kalau:
  //   - bot disabled
  //   - prompts empty
  //   - lagi sending (tunggu giliran)
  //   - <60dtk sejak real user message terakhir
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!botConfig?.enabled || botConfig.prompts.length === 0) {
      if (botTimerRef.current) {
        clearTimeout(botTimerRef.current)
        botTimerRef.current = null
      }
      return
    }
    const minMs = Math.max(10, botConfig.intervalMinSec) * 1000
    const maxMs = Math.max(minMs, botConfig.intervalMaxSec * 1000)
    const PAUSE_AFTER_REAL_USER_MS = 60_000

    function scheduleNext() {
      const ms = minMs + Math.floor(Math.random() * (maxMs - minMs))
      botTimerRef.current = setTimeout(() => {
        const sinceReal = Date.now() - lastRealUserAtRef.current
        const ok = sinceReal > PAUSE_AFTER_REAL_USER_MS
        if (ok && !sending) {
          const prompt =
            botConfig.prompts[
              Math.floor(Math.random() * botConfig.prompts.length)
            ]
          if (prompt) {
            void dispatchChat({ text: prompt, isBot: true })
          }
        }
        scheduleNext()
      }, ms)
    }
    scheduleNext()
    return () => {
      if (botTimerRef.current) {
        clearTimeout(botTimerRef.current)
        botTimerRef.current = null
      }
    }
  }, [botConfig, sending, dispatchChat])

  function trackProductClick(productId: string) {
    if (clientSessionId) {
      void fetch(`/api/live/${encodeURIComponent(slug)}/event`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientSessionId,
          type: 'PRODUCT_CLICK',
          productId,
        }),
      })
    }
    setLastClickedProductId(productId)
  }

  function productOrderHref(p: Product): string | null {
    if (!orderFormSlug) return null
    return `/order/${encodeURIComponent(orderFormSlug)}?product=${encodeURIComponent(p.id)}`
  }

  function onProductAsk(p: Product) {
    // "Tanya" button — selalu isi chat input, gak buka form.
    trackProductClick(p.id)
    setInput(`Saya tertarik ${p.name}. Bisa ceritain lebih detail?`)
  }

  // Show "Order via WA" trigger setelah ≥3 user message ATAU minimal 1 product click.
  const userMsgCount = messages.filter((m) => m.role === 'user').length
  const showOrderCta =
    leadStatus !== 'HANDOFF_SENT' &&
    (userMsgCount >= 3 || lastClickedProductId !== null)

  async function submitLead(input: { name: string; phone: string }) {
    if (!clientSessionId) return
    setLeadStatus('submitting')
    try {
      const res = await fetch(`/api/live/${encodeURIComponent(slug)}/lead`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientSessionId,
          name: input.name,
          phone: input.phone,
          productId: lastClickedProductId ?? undefined,
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { leadId: string; status: 'HANDOFF_SENT' | 'HANDOFF_FAILED' }
        error?: string
      }
      if (json.success && json.data) {
        setLeadStatus(json.data.status)
      } else {
        setLeadStatus('error')
        alert(json.error ?? 'Gagal kirim lead')
      }
    } catch {
      setLeadStatus('error')
    }
  }

  // Login gate — sebelum identity di-set, tampilkan form nama+WA dulu.
  if (!identity) {
    return (
      <JoinGate
        slug={slug}
        hostName={hostName}
        roomName={name}
        onJoin={(joinData) => {
          localStorage.setItem(
            `live:identity:${slug}`,
            JSON.stringify(joinData),
          )
          setIdentity(joinData)
        }}
      />
    )
  }

  // Layout TikTok Live mobile-first:
  // - Container = 100dvh hitam, video 9:16 di-center pakai object-contain (aspek
  //   asli generated dipertahankan — TIDAK di-crop). Letterbox samping/atas/bawah
  //   diisi gradient hitam halus supaya tetap immersive.
  // - Semua kontrol = overlay floating di atas video (header top, chat bottom-left,
  //   tombol kanan vertical stack, composer bottom). Tidak ada panel side-by-side
  //   yang mempersempit video.
  // - Tombol "Belanja" (keranjang) = FAB kuning-oranye dengan badge jumlah produk,
  //   bouncing pulse — di TikTok ini elemen paling standout. Klik → bottom sheet
  //   produk muncul slide-up.
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-white">
      {/* ===== VIDEO STAGE — full bleed, object-contain biar aspek 9:16 dari Kling
           dipertahankan apa adanya. Sisi yang lebar dari viewport diisi gelap. ===== */}
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        {/* Double-buffer video layers cross-fade 200ms. Inactive di-pause. */}
        <video
          ref={videoARef}
          src={urlA}
          aria-label={`Tayangan live ${hostName}`}
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 motion-reduce:transition-none ${
            activeLayer === 'A' ? 'opacity-100' : 'opacity-0'
          }`}
          // NATIVE_LIBRARY: video punya audio inline — kontrol via mute toggle user.
          // TTS mode: video selalu silent (audio dari TTS queue separate).
          muted={hostMode === 'NATIVE_LIBRARY' ? (muted || audioBlocked) : true}
          playsInline
          onLoadedData={() => handleLayerLoaded('A')}
          onEnded={() => {
            if (activeLayer !== 'A') return
            // NATIVE_LIBRARY: klip habis → pilih idle clip BERIKUTNYA (rotation).
            // Kalau cuma 1 idle clip, getNextIdleUrl return URL yang sama → restart.
            if (hostMode === 'NATIVE_LIBRARY') {
              setLiveState('idle')
              const nextIdle = getNextIdleUrl()
              if (nextIdle && urlA !== nextIdle) {
                switchToUrl(nextIdle)
              } else {
                const v = videoARef.current
                if (v) {
                  v.currentTime = 0
                  v.play().catch(() => {})
                }
              }
              return
            }
            const next = pickSceneUrl(liveState, urlA)
            if (next && next !== urlA) {
              switchToUrl(next)
            } else {
              const v = videoARef.current
              if (v) {
                v.currentTime = 0
                v.play().catch(() => {})
              }
            }
          }}
        />
        {urlB ? (
          <video
            ref={videoBRef}
            src={urlB}
            aria-hidden="true"
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 motion-reduce:transition-none ${
              activeLayer === 'B' ? 'opacity-100' : 'opacity-0'
            }`}
            muted={hostMode === 'NATIVE_LIBRARY' ? (muted || audioBlocked) : true}
            playsInline
            onLoadedData={() => handleLayerLoaded('B')}
            onEnded={() => {
              if (activeLayer !== 'B') return
              if (hostMode === 'NATIVE_LIBRARY') {
                setLiveState('idle')
                const nextIdle = getNextIdleUrl()
                if (nextIdle && urlB !== nextIdle) {
                  switchToUrl(nextIdle)
                } else {
                  const v = videoBRef.current
                  if (v) {
                    v.currentTime = 0
                    v.play().catch(() => {})
                  }
                }
                return
              }
              const next = pickSceneUrl(liveState, urlB)
              if (next && next !== urlB) {
                switchToUrl(next)
              } else {
                const v = videoBRef.current
                if (v) {
                  v.currentTime = 0
                  v.play().catch(() => {})
                }
              }
            }}
          />
        ) : null}
      </div>

      {/* ===== TOP GRADIENT — biar header overlay tetap kebaca di atas video terang ===== */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-black/60 via-black/25 to-transparent" />

      {/* ===== BOTTOM GRADIENT — biar chat + composer kebaca ===== */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[55%] bg-gradient-to-t from-black/70 via-black/25 to-transparent" />

      {/* ===== HEADER OVERLAY — host info kiri + LIVE pill + mute kanan ===== */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="flex min-w-0 items-center gap-2 rounded-full bg-black/35 px-2 py-1.5 backdrop-blur-md">
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-sm font-semibold text-white shadow-md"
            aria-hidden="true"
          >
            {hostName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                {hostName}
              </span>
              <span
                className="flex items-center gap-1 rounded-sm bg-red-600 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-white"
                aria-label={`Status host: ${
                  liveState === 'talking'
                    ? 'sedang bicara'
                    : liveState === 'thinking'
                      ? 'sedang berpikir'
                      : liveState === 'listening'
                        ? 'mendengarkan'
                        : liveState === 'greeting'
                          ? 'menyapa'
                          : 'siaran langsung'
                }`}
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white animate-pulse motion-reduce:animate-none" />
                LIVE
              </span>
            </div>
            <div className="truncate text-[11px] text-white/75 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
              {name}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? 'Hidupkan suara host' : 'Bisukan suara host'}
          aria-pressed={muted}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 motion-reduce:transition-none"
        >
          {muted ? <MicOff className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </header>

      {/* ===== AUDIO UNLOCK PROMPT — muncul kalau browser block autoplay ===== */}
      {audioBlocked && !muted ? (
        <button
          type="button"
          onClick={unlockAudio}
          className="absolute inset-x-0 top-20 z-30 mx-auto flex w-fit items-center gap-2 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(251,146,60,0.6)] ring-2 ring-white/40 transition active:scale-95 hover:bg-orange-600 motion-reduce:transition-none motion-safe:animate-pulse"
          aria-label="Klik untuk aktifkan suara host"
        >
          <Volume2 className="h-4 w-4" aria-hidden="true" />
          Klik untuk dengar suara host
        </button>
      ) : null}

      {/* ===== HOST "MIKIR" INDICATOR — pill kecil di tengah atas saat sending ===== */}
      {sending ? (
        <div
          className="absolute inset-x-0 top-20 z-20 flex justify-center"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-full bg-black/55 px-3 py-1.5 text-xs text-zinc-100 backdrop-blur-md drop-shadow-md">
            <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {hostName} lagi mikir…
          </div>
        </div>
      ) : null}

      {/* ===== SOCIAL PROOF — recent purchase popup ===== */}
      {orderFormSlug ? (
        <RecentPurchasePopup orderFormSlug={orderFormSlug} />
      ) : null}

      {/* ===== FLOATING CHAT OVERLAY — TikTok-style live comments kiri bawah ===== */}
      <FloatingChatOverlay
        messages={messages}
        hostName={hostName}
      />

      {/* ===== RIGHT ACTION STACK — Featured product card cycling + Order CTA ===== */}
      <div className="absolute right-3 bottom-24 z-30 flex flex-col items-end gap-2.5">
        {products.length > 0 ? (
          <FeaturedProductCard
            products={products}
            onOpenAll={() => setShowProducts(true)}
            productCount={products.length}
          />
        ) : null}

        {showOrderCta ? (
          leadStatus === 'HANDOFF_SENT' ? (
            <div
              className="flex items-center gap-1.5 rounded-full bg-emerald-500/95 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-sm"
              role="status"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Cek WhatsApp
            </div>
          ) : leadStatus === 'HANDOFF_FAILED' ? (
            <div
              className="rounded-full bg-amber-500/95 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-sm"
              role="status"
            >
              Tim CS sebentar lagi
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowLeadForm(true)}
              className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white shadow-[0_4px_14px_rgba(16,185,129,0.55)] ring-1 ring-white/20 transition active:scale-95 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Order WA
            </button>
          )
        ) : null}
      </div>

      {/* ===== BOTTOM COMPOSER — tipis transparant, TikTok style ===== */}
      <div className="absolute inset-x-0 bottom-0 z-30 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
          className="flex items-center gap-2"
          aria-label="Kirim pesan ke host"
        >
          <label htmlFor="live-composer-input" className="sr-only">
            Pesan untuk host
          </label>
          <input
            id="live-composer-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tulis komentar…"
            inputMode="text"
            enterKeyHint="send"
            autoComplete="off"
            className="flex-1 rounded-full border border-white/25 bg-black/40 px-4 py-2.5 text-sm text-white placeholder-white/60 backdrop-blur-md transition focus:border-orange-400/70 focus:bg-black/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40 motion-reduce:transition-none"
            disabled={sending}
            maxLength={500}
          />
          <button
            type="submit"
            disabled={Boolean(sending) || input.trim().length === 0}
            suppressHydrationWarning
            aria-label={sending ? 'Mengirim pesan' : 'Kirim pesan'}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:bg-white/20 disabled:text-white/50 motion-reduce:transition-none"
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Send className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </form>
      </div>

      {/* ===== PRODUCT BOTTOM SHEET — slide-up drawer TikTok shop style ===== */}
      {showProducts ? (
        <ProductBottomSheet
          products={products}
          onClose={() => setShowProducts(false)}
          onAsk={(p) => {
            onProductAsk(p)
            setShowProducts(false)
          }}
          onTrackClick={trackProductClick}
          orderHref={productOrderHref}
        />
      ) : null}

      {/* ===== LEAD FORM MODAL ===== */}
      {showLeadForm ? (
        <LeadFormModal
          submitting={leadStatus === 'submitting'}
          onClose={() => setShowLeadForm(false)}
          onSubmit={async (input) => {
            await submitLead(input)
            setShowLeadForm(false)
          }}
        />
      ) : null}

    </div>
  )
}

// TikTok Live-style chat overlay.
// Anatomi referensi TikTok mobile:
//   - Posisi kiri-bawah, ~70% lebar layar, sisanya nyisain ruang buat tombol kanan.
//   - Tanpa bubble background tebal — hanya pill rgba(0,0,0,0.18) + backdrop-blur tipis.
//   - Font kecil (13px), white dengan text-shadow tebal supaya readable
//     di atas video apapun (light/dark) tanpa harus bg solid.
//   - Username colored prefix (oranye/biru/abu sesuai role) — sisanya putih.
//   - Stack dari bawah, max 6-7 baris visible, oldest fade out via mask gradient.
//   - Tidak auto-hide by time — FIFO drop saat slot penuh.
function FloatingChatOverlay({
  messages,
  hostName,
}: {
  messages: ChatMsg[]
  hostName: string
}) {
  const MAX_VISIBLE = 7
  const visible = messages
    .filter((m) => m.id !== 'greeting')
    .slice(-MAX_VISIBLE)

  if (visible.length === 0) return null

  return (
    <div
      className="pointer-events-none absolute bottom-16 left-3 right-24 z-20 flex max-h-[42%] flex-col justify-end gap-1 overflow-hidden"
      style={{
        maskImage:
          'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.4) 18%, rgba(0,0,0,1) 38%)',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.4) 18%, rgba(0,0,0,1) 38%)',
      }}
      role="log"
      aria-live="polite"
      aria-label="Percakapan live"
    >
      {visible.map((m) => {
        const isUser = m.role === 'user'
        const speaker = m.viewerName ?? (isUser ? 'Anda' : hostName)
        // Warna username: host = oranye terang (brand), viewer bot = biru muda,
        // viewer real = hijau muda. Semua dengan text-shadow biar pop.
        const speakerColor = isUser
          ? m.isBot
            ? 'text-sky-300'
            : 'text-emerald-300'
          : 'text-orange-300'
        return (
          <div
            key={m.id}
            className="flex animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none motion-reduce:duration-0"
          >
            <div
              className="max-w-full rounded-full bg-black/25 px-2.5 py-1 backdrop-blur-[2px]"
              style={{
                textShadow: '0 1px 3px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.7)',
              }}
            >
              <span className={`text-[13px] font-semibold ${speakerColor}`}>
                {speaker}
              </span>
              <span className="ml-1.5 text-[13px] leading-snug text-white/95">
                {m.text}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Recent purchase social-proof popup overlay (TikTok live notif style).
// Fetch dari /api/p/social-proof/<formSlug>, cycle tiap N detik di bottom-left
// video. Transparant pill dengan checkmark icon.
function RecentPurchasePopup({
  orderFormSlug,
  intervalSec = 7,
}: {
  orderFormSlug: string
  intervalSec?: number
}) {
  interface ProofEntry {
    name: string
    city: string
    ts: string
  }
  const [entries, setEntries] = useState<ProofEntry[]>([])
  const [activeIdx, setActiveIdx] = useState<number>(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/p/social-proof/${encodeURIComponent(orderFormSlug)}`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: { entries: ProofEntry[] } }) => {
        if (cancelled) return
        if (j.success && j.data?.entries) setEntries(j.data.entries)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [orderFormSlug])

  useEffect(() => {
    if (entries.length === 0) return
    // Show first entry after small delay, then cycle.
    const showDelay = 2500
    const showT = setTimeout(() => setVisible(true), showDelay)
    const cycleT = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setActiveIdx((i) => (i + 1) % entries.length)
        setVisible(true)
      }, 400)
    }, intervalSec * 1000)
    return () => {
      clearTimeout(showT)
      clearInterval(cycleT)
    }
  }, [entries.length, intervalSec])

  if (entries.length === 0) return null
  const entry = entries[activeIdx]
  if (!entry) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute left-3 right-3 top-[18%] z-20 flex justify-start transition-all duration-500 motion-reduce:transition-none ${
        visible
          ? 'translate-x-0 opacity-100'
          : '-translate-x-3 opacity-0'
      }`}
    >
      <div className="flex max-w-[85%] items-center gap-2.5 rounded-xl border border-white/20 bg-gradient-to-r from-emerald-500 to-emerald-600 px-3.5 py-2 text-sm text-white shadow-2xl ring-2 ring-emerald-300/40 backdrop-blur-sm animate-in fade-in slide-in-from-left-4 duration-500 motion-reduce:animate-none motion-reduce:duration-0">
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/25 backdrop-blur-sm"
          aria-hidden="true"
        >
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-100">
            <span aria-hidden="true">✨ </span>Pembelian Baru
          </div>
          <div className="font-semibold">
            {entry.name} <span className="font-normal opacity-90">dari</span>{' '}
            {entry.city}
          </div>
        </div>
      </div>
    </div>
  )
}

// Featured product preview card — kanan-bawah video, cycling 5dtk antar produk.
// Pakai gambar + nama + harga (dengan flash sale badge & countdown kalau aktif).
// Klik card = buka bottom sheet semua produk. Ini ganti FAB ikon keranjang
// supaya lebih informatif (user langsung lihat produk yg dijual) tapi tetap
// standout via shadow glow + ribbon flash sale animate-pulse.
function FeaturedProductCard({
  products,
  onOpenAll,
  productCount,
}: {
  products: Product[]
  onOpenAll: () => void
  productCount: number
}) {
  const [idx, setIdx] = useState(0)
  const [fading, setFading] = useState(false)

  // Auto-cycle tiap 5dtk. Skip kalau cuma 1 produk.
  useEffect(() => {
    if (products.length <= 1) return
    const t = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setIdx((i) => (i + 1) % products.length)
        setFading(false)
      }, 220)
    }, 5000)
    return () => clearInterval(t)
  }, [products.length])

  const current = products[idx]
  if (!current) return null

  const flashOn =
    current.flashSalePrice != null && current.flashSalePrice < current.price
  const discount = flashOn
    ? Math.round(
        ((current.price - (current.flashSalePrice as number)) / current.price) *
          100,
      )
    : 0

  return (
    <button
      type="button"
      onClick={onOpenAll}
      aria-label={`Buka belanja — ${productCount} produk. Sekarang: ${current.name}`}
      className="group relative flex w-[200px] items-center gap-2 overflow-hidden rounded-2xl bg-white/95 p-1.5 text-left shadow-[0_8px_28px_rgba(0,0,0,0.45)] ring-1 ring-white/40 backdrop-blur-md transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 motion-reduce:transition-none"
    >
      {/* Halo pulse di belakang — standout effect TikTok shop */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-1 -z-10 rounded-3xl motion-safe:animate-pulse ${
          flashOn
            ? 'bg-gradient-to-r from-red-500/30 via-orange-500/40 to-yellow-400/30'
            : 'bg-gradient-to-r from-orange-400/25 to-yellow-400/25'
        }`}
      />

      {/* Thumbnail */}
      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-warm-100">
        {current.imageUrl ? (
          <img
            src={current.imageUrl}
            alt=""
            className={`h-full w-full object-cover transition-opacity duration-200 motion-reduce:transition-none ${
              fading ? 'opacity-0' : 'opacity-100'
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-warm-400" aria-hidden="true">
            <ShoppingCart className="h-5 w-5" />
          </div>
        )}
        {/* Flash sale ribbon */}
        {flashOn ? (
          <div
            className="absolute left-0 top-0 rounded-br-md bg-gradient-to-r from-red-600 to-orange-500 px-1 py-0.5 text-[8px] font-black uppercase leading-none tracking-wider text-white shadow"
            aria-label={`Flash sale diskon ${discount}%`}
          >
            -{discount}%
          </div>
        ) : null}
      </div>

      {/* Detail */}
      <div
        className={`flex min-w-0 flex-1 flex-col justify-between gap-0.5 transition-opacity duration-200 motion-reduce:transition-none ${
          fading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="flex items-center gap-1">
          {flashOn ? (
            <span className="inline-flex items-center gap-0.5 rounded-sm bg-red-600 px-1 py-px text-[8px] font-black uppercase tracking-wider text-white animate-pulse motion-reduce:animate-none">
              ⚡ FLASH
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 rounded-sm bg-orange-100 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-orange-700">
              LIVE
            </span>
          )}
          <span className="text-[9px] font-medium uppercase tracking-wide text-warm-500">
            {idx + 1}/{productCount}
          </span>
        </div>
        <div className="line-clamp-1 text-[11px] font-semibold leading-tight text-foreground">
          {current.name}
        </div>
        {flashOn ? (
          <div className="flex items-baseline gap-1 leading-none">
            <span className="text-[13px] font-black text-red-600">
              Rp {(current.flashSalePrice as number).toLocaleString('id-ID')}
            </span>
            <span className="text-[9px] text-warm-400 line-through">
              {current.price.toLocaleString('id-ID')}
            </span>
          </div>
        ) : (
          <div className="text-[13px] font-bold leading-none text-orange-600">
            Rp {current.price.toLocaleString('id-ID')}
          </div>
        )}
        {flashOn && current.flashSaleEndAt ? (
          <FlashSaleCountdown endAt={current.flashSaleEndAt} />
        ) : (
          <div className="flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider text-orange-500">
            <ShoppingCart className="h-2.5 w-2.5" aria-hidden="true" />
            Belanja semua →
          </div>
        )}
      </div>
    </button>
  )
}

// Countdown mm:ss kalau >0, hh:mm:ss kalau >1 jam, "Berakhir" kalau habis.
// Update tiap 1dtk.
function FlashSaleCountdown({ endAt }: { endAt: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const ms = new Date(endAt).getTime() - now
  if (ms <= 0) {
    return (
      <div className="text-[9px] font-semibold uppercase tracking-wider text-warm-400">
        Berakhir
      </div>
    )
  }
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  const display = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
  return (
    <div className="flex items-center gap-1 text-[9px] font-bold tabular-nums leading-none text-red-600">
      <span className="rounded-sm bg-red-600 px-1 py-px text-white">
        {display}
      </span>
      <span className="uppercase tracking-wider">tersisa</span>
    </div>
  )
}

// Product bottom-sheet — TikTok Shop drawer. Slide-up dari bawah, backdrop
// semi-gelap, daftar produk vertikal scroll. Klik produk = order link buka
// tab baru; tombol "Tanya host" = inject ke chat input + tutup sheet.
function ProductBottomSheet({
  products,
  onClose,
  onAsk,
  onTrackClick,
  orderHref,
}: {
  products: Product[]
  onClose: () => void
  onAsk: (p: Product) => void
  onTrackClick: (id: string) => void
  orderHref: (p: Product) => string | null
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-sheet-title"
    >
      <button
        type="button"
        aria-label="Tutup daftar produk"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      />
      <div className="relative z-10 flex w-full max-w-2xl flex-col rounded-t-3xl bg-white text-foreground shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-300" style={{ maxHeight: '75dvh' }}>
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5" aria-hidden="true">
          <div className="h-1.5 w-12 rounded-full bg-warm-300" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 pt-2">
          <h2 id="product-sheet-title" className="flex items-center gap-2 text-base font-semibold">
            <ShoppingCart className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Belanja ({products.length})
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-9 w-9 items-center justify-center rounded-full text-warm-700 transition hover:bg-warm-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 motion-reduce:transition-none"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom),1rem)]" role="list" aria-label="Daftar produk">
          {products.map((p) => {
            const href = orderHref(p)
            const flashOn =
              p.flashSalePrice != null && p.flashSalePrice < p.price
            const discount = flashOn
              ? Math.round(
                  ((p.price - (p.flashSalePrice as number)) / p.price) * 100,
                )
              : 0
            return (
              <div
                key={p.id}
                role="listitem"
                className={`mb-2 flex gap-3 rounded-2xl border bg-white p-2.5 shadow-sm transition motion-reduce:transition-none ${
                  flashOn
                    ? 'border-red-300 ring-1 ring-red-200/60 shadow-[0_4px_16px_rgba(239,68,68,0.18)]'
                    : 'border-warm-200 hover:border-orange-300'
                }`}
              >
                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-warm-100" aria-hidden="true" />
                  )}
                  {flashOn ? (
                    <div
                      className="absolute left-0 top-0 rounded-br-lg bg-gradient-to-r from-red-600 to-orange-500 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow"
                      aria-label={`Diskon flash sale ${discount} persen`}
                    >
                      -{discount}%
                    </div>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div>
                    {flashOn ? (
                      <div className="mb-0.5 inline-flex items-center gap-1 rounded-sm bg-red-600 px-1.5 py-px text-[10px] font-black uppercase tracking-wider text-white">
                        ⚡ Flash Sale
                      </div>
                    ) : null}
                    <div className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                      {p.name}
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="flex flex-col leading-none">
                      {flashOn ? (
                        <>
                          <span className="text-base font-black text-red-600">
                            Rp {(p.flashSalePrice as number).toLocaleString('id-ID')}
                          </span>
                          <span className="text-[10px] text-warm-400 line-through">
                            Rp {p.price.toLocaleString('id-ID')}
                          </span>
                          {p.flashSaleEndAt ? (
                            <span className="mt-0.5">
                              <FlashSaleCountdown endAt={p.flashSaleEndAt} />
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-base font-bold text-orange-600">
                          Rp {p.price.toLocaleString('id-ID')}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => onAsk(p)}
                        aria-label={`Tanya host tentang ${p.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-warm-200 text-warm-700 transition hover:bg-warm-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 motion-reduce:transition-none"
                      >
                        <HelpCircle className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => onTrackClick(p.id)}
                          aria-label={`Order ${p.name}`}
                          className={`flex h-9 items-center gap-1 rounded-full px-4 text-xs font-semibold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transition-none ${
                            flashOn
                              ? 'bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 focus-visible:ring-red-400'
                              : 'bg-orange-500 hover:bg-orange-600 focus-visible:ring-orange-400'
                          }`}
                        >
                          <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" /> Order
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function LeadFormModal({
  submitting,
  onClose,
  onSubmit,
}: {
  submitting: boolean
  onClose: () => void
  onSubmit: (input: { name: string; phone: string }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim().length < 2 || phone.trim().length < 8) return
    await onSubmit({ name: name.trim(), phone: phone.trim() })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-form-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-5 text-white shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="lead-form-title" className="text-base font-semibold">
              Tinggalkan nomor WA
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Tim CS akan lanjut chat di WhatsApp untuk bantu pesan.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup form"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 motion-reduce:transition-none"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="lead-name" className="text-sm text-zinc-300">Nama</label>
            <input
              id="lead-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama lengkap"
              autoComplete="name"
              className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-base placeholder-zinc-500 transition focus:border-orange-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40 motion-reduce:transition-none"
              maxLength={80}
              required
            />
          </div>
          <div>
            <label htmlFor="lead-phone" className="text-sm text-zinc-300">Nomor WhatsApp</label>
            <input
              id="lead-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08123456789"
              className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-base placeholder-zinc-500 transition focus:border-orange-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40 motion-reduce:transition-none"
              maxLength={20}
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting || name.trim().length < 2 || phone.trim().length < 8}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:bg-zinc-700 motion-reduce:transition-none"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Mengirim…
              </>
            ) : (
              <>
                <MessageSquare className="h-4 w-4" aria-hidden="true" /> Kirim &amp; Lanjut di WhatsApp
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

// Login gate — customer harus input nama + nomor WA sebelum masuk.
// UX: full-screen vertical layout, branded oranye, simple form 2 field.
function JoinGate({
  slug,
  hostName,
  roomName,
  onJoin,
}: {
  slug: string
  hostName: string
  roomName: string
  onJoin: (data: { name: string; phone: string }) => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function normalizePhone(input: string): string | null {
    const digits = input.replace(/[^\d+]/g, '')
    let normalized = digits.startsWith('+') ? digits.slice(1) : digits
    if (normalized.startsWith('0')) normalized = '62' + normalized.slice(1)
    else if (normalized.startsWith('8')) normalized = '62' + normalized
    if (!normalized.startsWith('628')) return null
    if (normalized.length < 11 || normalized.length > 15) return null
    return '+' + normalized
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmedName = name.trim()
    if (trimmedName.length < 2) {
      setError('Nama minimal 2 karakter')
      return
    }
    const normalized = normalizePhone(phone)
    if (!normalized) {
      setError('Nomor WA tidak valid (contoh: 08123456789)')
      return
    }
    setSubmitting(true)
    onJoin({ name: trimmedName, phone: normalized })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-orange-50 via-warm-50 to-amber-50 p-6">
      <div className="w-full max-w-sm rounded-3xl border bg-white p-6 shadow-2xl">
        <div className="mb-4 flex justify-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg"
            aria-hidden="true"
          >
            <span className="text-2xl">🎉</span>
          </div>
        </div>
        <h1 className="text-center text-xl font-semibold text-foreground">
          Selamat datang di Live
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          <strong>{roomName}</strong> bersama {hostName}
        </p>
        <p className="mt-3 rounded-md bg-warm-50 px-3 py-2 text-center text-sm text-warm-700">
          Isi nama &amp; nomor WA dulu supaya host bisa sapa Anda + kalau order
          gampang follow-up via WhatsApp.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="join-name" className="text-sm font-medium text-warm-700">Nama</label>
            <input
              id="join-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama panggilan (mis: Yanti, Pak Hendra)"
              autoComplete="name"
              className="mt-1 w-full rounded-md border border-warm-200 bg-warm-50 px-3 py-2.5 text-base transition focus:border-orange-500 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40 motion-reduce:transition-none"
              maxLength={80}
              required
            />
          </div>
          <div>
            <label htmlFor="join-phone" className="text-sm font-medium text-warm-700">
              Nomor WhatsApp
            </label>
            <input
              id="join-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08123456789"
              className="mt-1 w-full rounded-md border border-warm-200 bg-warm-50 px-3 py-2.5 text-base transition focus:border-orange-500 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40 motion-reduce:transition-none"
              maxLength={20}
              required
              aria-describedby={error ? 'join-error' : undefined}
            />
          </div>
          {error ? (
            <div
              id="join-error"
              role="alert"
              className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:bg-warm-300 motion-reduce:transition-none"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Masuk...
              </>
            ) : (
              <>Masuk Live <span aria-hidden="true">🚀</span></>
            )}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            Privasi: nomor WA cuma dipakai untuk follow-up order dari live ini.
          </p>
        </form>
      </div>
    </div>
  )
}
