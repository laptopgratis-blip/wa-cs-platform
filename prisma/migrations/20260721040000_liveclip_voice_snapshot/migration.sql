-- Snapshot suara ElevenLabs per klip (2026-07-21): HostTemplate.voiceId bisa
-- diganti kapan saja — tanpa snapshot, user lupa klip lama pakai suara siapa.
-- null = klip pra-fitur / hasil upload (tanpa TTS).
ALTER TABLE "LiveClip" ADD COLUMN "voiceId" TEXT;
ALTER TABLE "LiveClip" ADD COLUMN "voiceName" TEXT;
