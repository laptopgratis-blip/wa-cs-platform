-- CreateEnum
CREATE TYPE "WaProvider" AS ENUM ('BAILEYS', 'CLOUD_API');

-- AlterTable
ALTER TABLE "WhatsappSession" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "phoneNumberId" TEXT,
ADD COLUMN     "provider" "WaProvider" NOT NULL DEFAULT 'BAILEYS',
ADD COLUMN     "wabaId" TEXT,
ADD COLUMN     "wabaTokenEnc" TEXT,
ADD COLUMN     "wabaTokenExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "lastInboundAt" TIMESTAMP(3),
ADD COLUMN     "windowExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappSession_phoneNumberId_key" ON "WhatsappSession"("phoneNumberId");

