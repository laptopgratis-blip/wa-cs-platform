-- CreateEnum
CREATE TYPE "ObjectionCategory" AS ENUM ('HARGA_MAHAL', 'RAGU_KUALITAS', 'TAKUT_PENIPUAN', 'BUTUH_IZIN', 'NANTI_DULU', 'KURANG_PAHAM', 'BANDING_KOMPETITOR', 'TIDAK_BUTUH', 'MASALAH_TEKNIS', 'TIDAK_COCOK', 'LAINNYA');

-- CreateEnum
CREATE TYPE "ProposalTargetAsset" AS ENUM ('SYSTEM_PROMPT', 'GREETING', 'REBUTTAL_NOTE');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'APPLIED', 'REJECTED', 'ROLLED_BACK');

-- AlterTable
ALTER TABLE "LiveSession" ADD COLUMN     "objectionsAnalyzedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LiveObjection" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "ObjectionCategory" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "evidence" TEXT NOT NULL,
    "aiNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveObjection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveOptimizationProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "targetAsset" "ProposalTargetAsset" NOT NULL,
    "title" TEXT NOT NULL,
    "proposalText" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidenceSessionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "beforeSnapshot" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "decidedNote" TEXT,

    CONSTRAINT "LiveOptimizationProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveObjection_userId_category_createdAt_idx" ON "LiveObjection"("userId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "LiveObjection_liveSessionId_idx" ON "LiveObjection"("liveSessionId");

-- CreateIndex
CREATE INDEX "LiveOptimizationProposal_userId_status_createdAt_idx" ON "LiveOptimizationProposal"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LiveOptimizationProposal_liveRoomId_status_createdAt_idx" ON "LiveOptimizationProposal"("liveRoomId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LiveSession_objectionsAnalyzedAt_idx" ON "LiveSession"("objectionsAnalyzedAt");

-- AddForeignKey
ALTER TABLE "LiveObjection" ADD CONSTRAINT "LiveObjection_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveObjection" ADD CONSTRAINT "LiveObjection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveOptimizationProposal" ADD CONSTRAINT "LiveOptimizationProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveOptimizationProposal" ADD CONSTRAINT "LiveOptimizationProposal_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
