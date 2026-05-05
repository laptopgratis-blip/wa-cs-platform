-- CreateTable AiModelPreset
CREATE TABLE "AiModelPreset" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "inputPricePer1M" DOUBLE PRECISION NOT NULL,
    "outputPricePer1M" DOUBLE PRECISION NOT NULL,
    "contextWindow" INTEGER,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "lastUpdatedSource" TEXT,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiModelPreset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiModelPreset_modelId_key" ON "AiModelPreset"("modelId");
CREATE INDEX "AiModelPreset_provider_isAvailable_idx" ON "AiModelPreset"("provider", "isAvailable");

-- CreateTable PricingResearchLog
CREATE TABLE "PricingResearchLog" (
    "id" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "modelsAdded" INTEGER NOT NULL DEFAULT 0,
    "modelsUpdated" INTEGER NOT NULL DEFAULT 0,
    "rawResponse" TEXT,
    "diff" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "PricingResearchLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PricingResearchLog_startedAt_idx" ON "PricingResearchLog"("startedAt");

-- Seed AiModelPreset dari static list lib/ai-models-list.ts. Source 'seed'.
INSERT INTO "AiModelPreset" ("id", "provider", "modelId", "displayName", "inputPricePer1M", "outputPricePer1M", "lastUpdatedSource", "lastUpdatedAt", "createdAt") VALUES
  ('seed_claude_opus_4_5',         'ANTHROPIC', 'claude-opus-4-5',       'Claude Opus 4.5 (Paling Pintar)',     15,     75,    'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_claude_sonnet_4_5',       'ANTHROPIC', 'claude-sonnet-4-5',     'Claude Sonnet 4.5 (Pintar)',           3,     15,    'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_claude_haiku_4_5',        'ANTHROPIC', 'claude-haiku-4-5',      'Claude Haiku 4.5 (Cepat & Hemat)',     1,      5,    'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_gpt_5',                   'OPENAI',    'gpt-5',                 'GPT-5 (Premium)',                      1.25,  10,    'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_gpt_5_mini',              'OPENAI',    'gpt-5-mini',            'GPT-5 Mini (Hemat)',                   0.15,   0.60, 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_gpt_4_1',                 'OPENAI',    'gpt-4.1',               'GPT-4.1',                              2.50,  10,    'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_gpt_4o',                  'OPENAI',    'gpt-4o',                'GPT-4o',                               2.50,  10,    'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_gpt_4o_mini',             'OPENAI',    'gpt-4o-mini',           'GPT-4o Mini',                          0.15,   0.60, 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_gemini_2_5_pro',          'GOOGLE',    'gemini-2.5-pro',        'Gemini 2.5 Pro (Pintar)',              1.25,  10,    'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_gemini_2_5_flash',        'GOOGLE',    'gemini-2.5-flash',      'Gemini 2.5 Flash',                     0.30,   2.50, 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_gemini_2_0_flash',        'GOOGLE',    'gemini-2.0-flash',      'Gemini 2.0 Flash (Hemat)',             0.10,   0.40, 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_gemini_2_0_flash_lite',   'GOOGLE',    'gemini-2.0-flash-lite', 'Gemini 2.0 Flash Lite (Termurah)',     0.075,  0.30, 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
