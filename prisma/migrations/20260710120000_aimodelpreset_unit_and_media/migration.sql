-- Lengkapi pricing database: satuan charge + model non-chat (media/TTS/embedding).
--
-- CATATAN PENTING — migrasi ini SENGAJA idempoten.
-- SQL-nya sudah pernah dijalankan LANGSUNG di DB produksi (via db push/psql),
-- jadi kolom + baris seed sudah ada di sana tapi tidak tercatat di
-- _prisma_migrations. Tanpa `IF NOT EXISTS`, `prisma migrate deploy` di
-- produksi akan gagal duplicate column dan menghentikan seluruh deploy.
-- INSERT sudah aman sejak awal lewat ON CONFLICT DO NOTHING.

ALTER TABLE "AiModelPreset" ADD COLUMN IF NOT EXISTS "unitType" TEXT NOT NULL DEFAULT 'TOKEN';
ALTER TABLE "AiModelPreset" ADD COLUMN IF NOT EXISTS "unitLabel" TEXT;

-- Seed model yang DIPAKAI fitur (AiFeatureConfig) tapi belum ada di pricing DB.
-- Nilai inputPricePer1M SAMA PERSIS dengan AiFeatureConfig → sync = no-op (charging
-- tidak berubah). Idempotent via ON CONFLICT (modelId unik).
INSERT INTO "AiModelPreset"
  ("id", "provider", "modelId", "displayName", "inputPricePer1M", "outputPricePer1M",
   "contextWindow", "isAvailable", "notes", "unitType", "unitLabel", "lastUpdatedSource", "lastUpdatedAt", "createdAt")
VALUES
  ('aimp_seed_gemini_nano_image', 'GOOGLE', 'gemini-3.1-flash-image-preview',
   'Gemini Nano Banana 2 (Gambar Host)', 45000, 0, NULL, true,
   '$0.045 per gambar (1K res). Generate avatar host CS Live AI.', 'IMAGE', 'image', 'seed', now(), now()),
  ('aimp_seed_kling_i2v', 'KLING', 'fal-ai/kling-video/v2.1/master/image-to-video',
   'Kling v2.1 Master (Gambar→Video)', 100000, 0, NULL, true,
   '$0.10 per detik via Fal.ai. Animasikan gambar host jadi MP4 looping.', 'VIDEO_SECOND', 'detik', 'seed', now(), now()),
  ('aimp_seed_kling_lipsync', 'KLING', 'kling-lip-sync',
   'Kling Lip-Sync', 100000, 0, NULL, true,
   '$0.10 per detik output. Lip-sync klip live dari baseline video.', 'VIDEO_SECOND', 'detik', 'seed', now(), now()),
  ('aimp_seed_eleven_ml_v2', 'ELEVENLABS', 'eleven_multilingual_v2',
   'ElevenLabs Multilingual v2 (TTS)', 30, 0, NULL, true,
   '$30 per 1M karakter (~$0.015/1k char). TTS Indonesian native.', 'TOKEN', 'character', 'seed', now(), now()),
  ('aimp_seed_openai_tts_mini', 'OPENAI', 'gpt-4o-mini-tts',
   'OpenAI TTS (gpt-4o-mini-tts)', 12, 0, NULL, true,
   'Efektif $12 per 1M karakter input (termasuk audio output). TTS realtime host.', 'TOKEN', 'character', 'seed', now(), now()),
  ('aimp_seed_openai_whisper', 'OPENAI', 'whisper-1',
   'OpenAI Whisper', 100, 0, NULL, true,
   '$0.006/menit = $100 per 1M detik audio. Transcribe upload klip.', 'TOKEN', 'second', 'seed', now(), now()),
  ('aimp_seed_openai_embed_small', 'OPENAI', 'text-embedding-3-small',
   'OpenAI Embedding 3 Small', 0.02, 0, NULL, true,
   '$0.02 per 1M token. Embedding transcript klip untuk match saat live.', 'TOKEN', 'token', 'seed', now(), now())
ON CONFLICT ("modelId") DO NOTHING;
