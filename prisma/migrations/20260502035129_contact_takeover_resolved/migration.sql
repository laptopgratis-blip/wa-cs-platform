-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "aiPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isResolved" BOOLEAN NOT NULL DEFAULT false;
