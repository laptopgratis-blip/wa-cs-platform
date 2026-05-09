-- CreateTable
CREATE TABLE "LpGeneration" (
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LpGeneration_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "LpGeneration_userId_createdAt_idx" ON "LpGeneration"("userId", "createdAt" DESC);
-- CreateIndex
CREATE INDEX "LpGeneration_lpId_createdAt_idx" ON "LpGeneration"("lpId", "createdAt" DESC);
-- AddForeignKey
ALTER TABLE "LpGeneration" ADD CONSTRAINT "LpGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LpGeneration" ADD CONSTRAINT "LpGeneration_lpId_fkey" FOREIGN KEY ("lpId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
