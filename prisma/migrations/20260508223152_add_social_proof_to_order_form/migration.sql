-- AlterTable
ALTER TABLE "OrderForm" ADD COLUMN     "socialProofEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "socialProofIntervalSec" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "socialProofPosition" TEXT NOT NULL DEFAULT 'bottom';
