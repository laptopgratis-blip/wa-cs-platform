-- CreateEnum
CREATE TYPE "SoulSimulationStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SoulSimulationOutcome" AS ENUM ('SOLD', 'REJECTED', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "SoulSimulationRole" AS ENUM ('SELLER', 'BUYER');

-- CreateTable
CREATE TABLE "SoulSimulation" (
    "id" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "sellerSoulId" TEXT NOT NULL,
    "sellerModelId" TEXT NOT NULL,
    "sellerContext" TEXT NOT NULL,
    "buyerSoulId" TEXT NOT NULL,
    "buyerModelId" TEXT NOT NULL,
    "buyerScenario" TEXT NOT NULL,
    "totalRounds" INTEGER NOT NULL DEFAULT 10,
    "starterRole" "SoulSimulationRole" NOT NULL,
    "starterMessage" TEXT NOT NULL,
    "status" "SoulSimulationStatus" NOT NULL DEFAULT 'RUNNING',
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "conversation" JSONB NOT NULL DEFAULT '[]',
    "evaluationScore" DOUBLE PRECISION,
    "evaluationData" JSONB,
    "outcome" "SoulSimulationOutcome",
    "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCostRp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoulSimulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoulSimulationPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoulSimulationPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SoulSimulation_triggeredBy_createdAt_idx" ON "SoulSimulation"("triggeredBy", "createdAt");

-- CreateIndex
CREATE INDEX "SoulSimulation_status_createdAt_idx" ON "SoulSimulation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SoulSimulation_sellerSoulId_idx" ON "SoulSimulation"("sellerSoulId");

-- CreateIndex
CREATE INDEX "SoulSimulationPreset_createdBy_createdAt_idx" ON "SoulSimulationPreset"("createdBy", "createdAt");

-- AddForeignKey
ALTER TABLE "SoulSimulation" ADD CONSTRAINT "SoulSimulation_triggeredBy_fkey" FOREIGN KEY ("triggeredBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoulSimulation" ADD CONSTRAINT "SoulSimulation_sellerSoulId_fkey" FOREIGN KEY ("sellerSoulId") REFERENCES "Soul"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoulSimulation" ADD CONSTRAINT "SoulSimulation_sellerModelId_fkey" FOREIGN KEY ("sellerModelId") REFERENCES "AiModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoulSimulation" ADD CONSTRAINT "SoulSimulation_buyerSoulId_fkey" FOREIGN KEY ("buyerSoulId") REFERENCES "Soul"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoulSimulation" ADD CONSTRAINT "SoulSimulation_buyerModelId_fkey" FOREIGN KEY ("buyerModelId") REFERENCES "AiModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoulSimulationPreset" ADD CONSTRAINT "SoulSimulationPreset_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
