-- AlterTable: ubah inputPricePer1M & outputPricePer1M dari INTEGER ke DOUBLE PRECISION (Float)
-- Semantik berubah dari "IDR per 1 juta token" ke "USD per 1 juta token".
ALTER TABLE "AiModel"
  ALTER COLUMN "inputPricePer1M" SET DATA TYPE DOUBLE PRECISION,
  ALTER COLUMN "outputPricePer1M" SET DATA TYPE DOUBLE PRECISION;

ALTER TABLE "AiModel"
  ALTER COLUMN "inputPricePer1M" SET DEFAULT 0,
  ALTER COLUMN "outputPricePer1M" SET DEFAULT 0;

-- Seed harga USD per 1M token untuk model yang sudah ada (per modelId).
UPDATE "AiModel" SET "inputPricePer1M" = 0.10, "outputPricePer1M" = 0.40
  WHERE "modelId" = 'gemini-2.0-flash';
UPDATE "AiModel" SET "inputPricePer1M" = 1.25, "outputPricePer1M" = 10.00
  WHERE "modelId" = 'gemini-2.5-pro';
UPDATE "AiModel" SET "inputPricePer1M" = 0.15, "outputPricePer1M" = 0.60
  WHERE "modelId" = 'gpt-5-mini';
UPDATE "AiModel" SET "inputPricePer1M" = 0.80, "outputPricePer1M" = 4.00
  WHERE "modelId" = 'claude-haiku-4-5-20251001';
UPDATE "AiModel" SET "inputPricePer1M" = 3.00, "outputPricePer1M" = 15.00
  WHERE "modelId" = 'claude-sonnet-4-6';
