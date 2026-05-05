-- DropForeignKey
ALTER TABLE "SoulSimulation" DROP CONSTRAINT "SoulSimulation_buyerSoulId_fkey";

-- DropForeignKey
ALTER TABLE "SoulSimulation" DROP CONSTRAINT "SoulSimulation_sellerSoulId_fkey";

-- AlterTable
ALTER TABLE "SoulSimulation" ADD COLUMN     "buyerPersonalityId" TEXT,
ADD COLUMN     "buyerStyleId" TEXT,
ADD COLUMN     "sellerPersonalityId" TEXT,
ADD COLUMN     "sellerStyleId" TEXT,
ALTER COLUMN "sellerSoulId" DROP NOT NULL,
ALTER COLUMN "buyerSoulId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "SoulSimulation_sellerPersonalityId_idx" ON "SoulSimulation"("sellerPersonalityId");

-- AddForeignKey
ALTER TABLE "SoulSimulation" ADD CONSTRAINT "SoulSimulation_sellerSoulId_fkey" FOREIGN KEY ("sellerSoulId") REFERENCES "Soul"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoulSimulation" ADD CONSTRAINT "SoulSimulation_sellerPersonalityId_fkey" FOREIGN KEY ("sellerPersonalityId") REFERENCES "SoulPersonality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoulSimulation" ADD CONSTRAINT "SoulSimulation_sellerStyleId_fkey" FOREIGN KEY ("sellerStyleId") REFERENCES "SoulStyle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoulSimulation" ADD CONSTRAINT "SoulSimulation_buyerSoulId_fkey" FOREIGN KEY ("buyerSoulId") REFERENCES "Soul"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoulSimulation" ADD CONSTRAINT "SoulSimulation_buyerPersonalityId_fkey" FOREIGN KEY ("buyerPersonalityId") REFERENCES "SoulPersonality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoulSimulation" ADD CONSTRAINT "SoulSimulation_buyerStyleId_fkey" FOREIGN KEY ("buyerStyleId") REFERENCES "SoulStyle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
