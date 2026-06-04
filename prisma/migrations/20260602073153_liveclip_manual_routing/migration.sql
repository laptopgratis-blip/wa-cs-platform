-- AlterTable
ALTER TABLE "LiveClip" ADD COLUMN     "manualConfidence" DOUBLE PRECISION,
ADD COLUMN     "matchMode" TEXT NOT NULL DEFAULT 'COSINE',
ADD COLUMN     "triggerKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
