# Deploy Hulao ke VPS — Checklist

Catatan deploy dari local (push ke GitHub) → pull ke VPS Hostinger.
Update: 2026-06-10

---

## ⚡ Khusus branch perf/p0-traffic-spike (tuning traffic spike)

Selain langkah deploy biasa, branch ini butuh 2 langkah manual:

1. **`.env.production` di VPS** — naikkan pool Prisma (10 → 30):
   ```
   DATABASE_URL="...?connection_limit=30&schema=public"
   ```
   Berlaku setelah container nextjs di-recreate. (nextjs 30 + wa-service 30
   masih jauh di bawah max_connections=100 Postgres.)

2. **Recreate postgres** — tuning `shared_buffers` dkk di docker-compose.yml
   baru aktif setelah:
   ```bash
   docker compose up -d postgres   # downtime DB beberapa detik
   docker compose up -d --force-recreate nextjs wa-service
   ```
   Verifikasi: `docker exec hulao-postgres psql -U hulao -d hulao -c "SHOW shared_buffers;"` → `512MB`.

3. **(Di luar repo) CDN untuk /uploads/** — pasang Cloudflare di depan hulao.id
   (DNS proxy, cache MP4/gambar). Tanpa ini, video klip tetap diserve langsung
   dari bandwidth VPS saat ratusan viewer download klip baru serentak.

---

## 🚨 WAJIB dilakuin (urut)

```bash
cd /path/to/hulao
git pull
npm install                    # cek package.json — ada dep baru?
npx prisma migrate deploy      # apply semua migration pending
npm run build                  # auto-include `prisma generate`
pm2 restart hulao              # atau systemctl restart, sesuai setup VPS
```

> **`prisma migrate deploy`** (bukan `migrate dev`) — production-safe, gak nawarin reset DB, gak prompt interaktif.

---

## ✅ TIDAK perlu diubah (biasanya)

- **`.env`** — env var udah lengkap. Cek aja kalau ada `process.env.XXX` baru di code:
  ```bash
  grep -rE "process\.env\.[A-Z_]+" lib/services/ --include="*.ts" -h | grep -oE "process\.env\.[A-Z_]+" | sort -u
  ```
  Bandingkan dengan `.env` VPS.

- **API keys** — disimpan di **DB** (tabel `ApiKey`), bukan env. Setup via `/admin/api-keys`:
  - `ANTHROPIC` — Claude chat & trigger suggester
  - `OPENAI` — embedding (klip matching) + Whisper (upload klip)
  - `KLING` — image2video + lipsync (host avatar + klip)
  - `ELEVENLABS` — TTS (Klip Live audio generation)
  - `GOOGLE` — Gemini image gen (host avatar)

- **AiFeatureConfig seed** — fallback ke `DEFAULTS` object di `lib/services/ai-feature-config.ts`, jalan tanpa seed. Mau tunable di `/admin/ai-features`? Seed manual per feature key.

---

## ⚙️ Setup cron-job.org BARU (kalau Klip Live + Live Bot di prod)

Dev pakai `dev-cron-runner.ts` (in-process `setInterval`).
Prod **NGGAK** — pakai HTTP triggers dari cron-job.org.

| Endpoint | Frekuensi | Tujuan |
|---|---|---|
| `https://hulao.id/api/cron/kling-poll?secret={CRON_SECRET}` | 60 detik | Poll Kling video gen (host avatar + klip lipsync) |
| `https://hulao.id/api/cron/live-bot?secret={CRON_SECRET}` | 30 detik | Bot viewer chat di live room |
| `https://hulao.id/api/cron/live-objection-extract?secret={CRON_SECRET}` | 5 menit | Analisis objection customer |
| `https://hulao.id/api/cron/followup-cleanup?secret={CRON_SECRET}` | 1 jam | Cleanup followup expired |
| `https://hulao.id/api/cron/followup-send?secret={CRON_SECRET}` | 1 menit | Kirim followup terjadwal |
| `https://hulao.id/api/cron/auth-otp-cleanup?secret={CRON_SECRET}` | 15 menit | Hapus OTP expired |
| `https://hulao.id/api/cron/lp-signals-extract?secret={CRON_SECRET}` | 5 menit | Extract signals dari LP |
| `https://hulao.id/api/cron/subscription-expire?secret={CRON_SECRET}` | Daily 00:30 WIB | Cek subscription expire |

`CRON_SECRET` di-set di `.env` VPS. Daftarin di cron-job.org (free tier OK), method GET.

---

## 📊 Data state setelah migration

- Host TTS yang udah ada di prod **tetap jalan** (mode default `TTS_GENERATIVE`)
- Klip Live mode (NATIVE_LIBRARY) **ada code tapi belum ada data** — owner perlu bikin host baru di mode itu via UI `/host-templates`
- Tabel baru (LiveClip, LiveClipUsage, BackgroundPreset, VisualHookPreset, dll) — kosong, gak ganggu data existing
- Column baru di LiveClip (`triggerKeywords`, `matchMode`, `manualConfidence`, `audioUrl`) — semua nullable/default, **backward-compat**

---

## ⚠️ Verifikasi setelah deploy

1. **Cek migration applied**:
   ```bash
   npx prisma migrate status
   ```
   Output harus: `Database schema is up to date!`

2. **Cek server jalan**:
   ```bash
   pm2 logs hulao --lines 50
   curl -I https://hulao.id  # 200 OK
   ```

3. **Cek cron-job.org hit endpoint**:
   - Di cron-job.org dashboard → execution history → 200 OK
   - Di server log: `[bot-runner] room nisa chat HTTP 200`

4. **Cek storage disk** (kalau pakai Klip Live):
   ```bash
   df -h /                                          # total disk
   du -sh public/uploads/clips public/uploads/host-videos  # klip + baseline videos
   ```
   Tiap klip ~3-4MB MP4. 100 klip ≈ 400MB. Cek free space.

5. **Cek API keys aktif** di `/admin/api-keys`:
   - Lastest test status: ✅ SUCCESS untuk semua provider yg dipake

---

## 🔥 Kalau ada masalah

### Migration gagal
```bash
npx prisma migrate status     # lihat mana yg pending vs applied
npx prisma migrate resolve --applied <migration_name>  # kalau perlu skip
```
> ⚠️ JANGAN `migrate reset` di prod — itu drop semua data!

### Prisma client outdated
Setelah `npm install` atau migrate, **wajib regenerate**:
```bash
npx prisma generate
pm2 restart hulao  # restart Node biar load client baru
```

### OpenAI quota habis
- Top-up di platform.openai.com
- Sementara: keyword routing tetep jalan (di-fix di session 2026-06-02)
- Cosine matching fallback ke evergreen/idle clip

### Klip Live "Bentar ya kak host lagi siap-siap"
- Berarti `matchClip()` return null (sebelum fix) atau owner belum bikin klip IDLE
- Generate minimal 1 klip kategori IDLE atau set `isDefaultIdle=true` di salah satu klip

### Bot live gak nyala
1. Cek `botEnabled=true` di LiveRoom (via `/admin/live-rooms`)
2. Cek `botPrompts.length > 0`
3. Cek cron-job.org URL & secret bener
4. Cek server log `[bot-runner] room ... chat HTTP ...`

---

## 📋 Audit perubahan custom

Sebelum push, cek apakah ada perubahan custom yang gak boleh ke prod:

```bash
git diff HEAD                  # semua perubahan
git status --short             # file modified + untracked

# Cek apakah ada hardcoded secret/key
grep -rE "sk-(ant|proj|or)|api_key.*=.*['\"]" lib/ app/ --include="*.ts" --include="*.tsx"
```

---

## 🗂 Migration history (referensi)

Latest migrations (chronological):

| Tanggal | Migration | Isi |
|---|---|---|
| 2026-06-01 | `init` | Schema awal |
| 2026-06-01 | `host_templates_pr0a` | HostTemplate model |
| 2026-06-01 | `live_rooms_pr0b` | LiveRoom + LiveSession |
| 2026-06-01 | `live_tangkap_pr0c` | Lead capture |
| 2026-06-01 | `live_objection_proposal` | Objection analyzer |
| 2026-06-01 | `host_scenes` | Scene library per host |
| 2026-06-01 | `host_scene_category` | Scene kategori |
| 2026-06-01 | `live_bot_prompts` | Bot viewer chat |
| 2026-06-01 | `host_scene_enabled` | Soft-disable scene |
| 2026-06-01 | `live_room_order_form` | Order form integration |
| 2026-06-01 | `live_chat_tts_settings` | Per-room TTS config |
| 2026-06-01 | `live_tts_controls` | TTS pause settings |
| 2026-06-02 | `klip_live_foundation` | Klip Live mode (HostMode enum, LiveClip, BackgroundPreset, VisualHookPreset) |
| 2026-06-02 | `liveclip_manual_routing` | triggerKeywords, matchMode, manualConfidence di LiveClip |

---

## TL;DR — Deploy minimal

```bash
git pull && npm install && npx prisma migrate deploy && npm run build && pm2 restart hulao
```

Itu aja 90% kasus. Setup cron-job.org cuma 1× di awal (setelah itu permanent).
