-- CreateTable
CREATE TABLE "LpOptimization" (
    "id" TEXT NOT NULL,
    "lpId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "inputPricePer1MUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outputPricePer1MUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "providerCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "providerCostRp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platformTokensCharged" INTEGER NOT NULL DEFAULT 0,
    "suggestionsJson" JSONB NOT NULL DEFAULT '[]',
    "focusAreasJson" JSONB NOT NULL DEFAULT '[]',
    "scoreBefore" INTEGER,
    "scoreAfter" INTEGER,
    "contextSummary" TEXT,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" TIMESTAMP(3),
    "beforeHtml" TEXT,
    "afterHtml" TEXT,
    "appliedVersionId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LpOptimization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LpVersion" (
    "id" TEXT NOT NULL,
    "lpId" TEXT NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "optimizationId" TEXT,
    "scoreSnapshot" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LpVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LpOptimization_lpId_createdAt_idx" ON "LpOptimization"("lpId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LpOptimization_userId_createdAt_idx" ON "LpOptimization"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LpVersion_lpId_createdAt_idx" ON "LpVersion"("lpId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "LpOptimization" ADD CONSTRAINT "LpOptimization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LpOptimization" ADD CONSTRAINT "LpOptimization_lpId_fkey" FOREIGN KEY ("lpId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LpVersion" ADD CONSTRAINT "LpVersion_lpId_fkey" FOREIGN KEY ("lpId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

