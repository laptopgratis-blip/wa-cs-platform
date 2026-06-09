// ─────────────────────────────────────────
// Video transcode helper — kompres MP4 host (scene/clip) ke bitrate web.
// ─────────────────────────────────────────
// Output mentah Kling ~8-11 Mbps (10-14 MB/klip 10dtk) → terlalu berat untuk
// HP, bikin live room patah-patah saat ganti scene. Helper ini transcode ke
// H.264 CRF 23 maxrate 3 Mbps + faststart (≈2 MB, SSIM ~0.987, mata sulit beda).
//
// SAFE-BY-DESIGN: kalau ffmpeg tidak ada / gagal / hasil malah lebih besar →
// file ASLI dibiarkan utuh (pipeline TIDAK pernah rusak gara-gara transcode).
// In-place: hasil ditulis ke <file>.tmp.mp4 lalu rename menimpa (path/URL tetap).
import { spawn } from 'node:child_process'
import { stat, rename, unlink } from 'node:fs/promises'

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'
// Skip kalau bitrate efektif (bytes*8/durasi) sudah di bawah ini.
const SKIP_BITRATE_BPS = 3_500_000

function run(
  cmd: string,
  args: string[],
  timeoutMs = 120_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const t = setTimeout(() => {
      p.kill('SIGKILL')
      reject(new Error(`${cmd} timeout`))
    }, timeoutMs)
    p.stdout.on('data', (d) => (stdout += d.toString()))
    p.stderr.on('data', (d) => (stderr += d.toString()))
    p.on('error', (e) => {
      clearTimeout(t)
      reject(e)
    })
    p.on('close', (code) => {
      clearTimeout(t)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

async function probe(
  file: string,
): Promise<{ durationSec: number; hasAudio: boolean } | null> {
  try {
    const dur = await run(
      FFPROBE,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
      15_000,
    )
    const aud = await run(
      FFPROBE,
      [
        '-v',
        'error',
        '-select_streams',
        'a',
        '-show_entries',
        'stream=codec_type',
        '-of',
        'csv=p=0',
        file,
      ],
      15_000,
    )
    const durationSec = parseFloat(dur.stdout.trim()) || 0
    return { durationSec, hasAudio: aud.stdout.trim().length > 0 }
  } catch {
    return null
  }
}

/**
 * Transcode MP4 in-place ke bitrate web-friendly. Tidak pernah throw — selalu
 * mengembalikan status, dan kalau gagal file asli tetap utuh.
 * @param absPath path absolut file .mp4
 */
export async function transcodeVideoToWeb(
  absPath: string,
): Promise<{ ok: boolean; reason: string; beforeBytes?: number; afterBytes?: number }> {
  let beforeBytes: number
  try {
    beforeBytes = (await stat(absPath)).size
  } catch {
    return { ok: false, reason: 'file-not-found' }
  }

  const info = await probe(absPath)
  if (!info) {
    // ffprobe tak ada / error → jangan sentuh file.
    return { ok: false, reason: 'probe-failed', beforeBytes }
  }
  if (info.durationSec > 0) {
    const bitrate = (beforeBytes * 8) / info.durationSec
    if (bitrate < SKIP_BITRATE_BPS) {
      return { ok: true, reason: 'already-optimized', beforeBytes, afterBytes: beforeBytes }
    }
  }

  const tmp = `${absPath}.tmp.mp4`
  const common = [
    '-nostdin',
    '-y',
    '-loglevel',
    'error',
    '-i',
    absPath,
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '23',
    '-preset',
    'medium',
    '-maxrate',
    '3M',
    '-bufsize',
    '6M',
  ]
  const audioArgs = info.hasAudio
    ? ['-c:a', 'aac', '-b:a', '128k']
    : ['-an']
  const args = [...common, ...audioArgs, '-movflags', '+faststart', tmp]

  try {
    const r = await run(FFMPEG, args, 180_000)
    if (r.code !== 0) {
      await unlink(tmp).catch(() => {})
      return { ok: false, reason: `ffmpeg-exit-${r.code}`, beforeBytes }
    }
    const afterBytes = (await stat(tmp)).size
    if (afterBytes <= 0 || afterBytes >= beforeBytes) {
      await unlink(tmp).catch(() => {})
      return { ok: true, reason: 'kept-original', beforeBytes, afterBytes: beforeBytes }
    }
    await rename(tmp, absPath)
    return { ok: true, reason: 'transcoded', beforeBytes, afterBytes }
  } catch (e) {
    await unlink(tmp).catch(() => {})
    return {
      ok: false,
      reason: `ffmpeg-error:${e instanceof Error ? e.message : 'unknown'}`,
      beforeBytes,
    }
  }
}
