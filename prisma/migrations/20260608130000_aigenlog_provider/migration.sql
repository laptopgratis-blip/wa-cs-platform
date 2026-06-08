-- Monitoring biaya AI: dimensi provider di AiGenerationLog.
-- Nullable + index. Backfill provider dari modelName via script terpisah.

ALTER TABLE "AiGenerationLog" ADD COLUMN "provider" TEXT;

CREATE INDEX "AiGenerationLog_provider_createdAt_idx" ON "AiGenerationLog"("provider", "createdAt");
