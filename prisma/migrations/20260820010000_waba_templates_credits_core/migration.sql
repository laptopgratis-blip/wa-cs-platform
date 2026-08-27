-- CreateEnum
CREATE TYPE "MessageCreditTxType" AS ENUM ('PURCHASE', 'USAGE', 'REFUND', 'ADJUSTMENT', 'BONUS');

-- CreateEnum
CREATE TYPE "MetaTemplateCategory" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION');

-- CreateEnum
CREATE TYPE "MetaTemplateStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL', 'LIMIT_EXCEEDED', 'DELETED');

-- CreateEnum
CREATE TYPE "TokenPackageKind" AS ENUM ('TOKEN', 'MESSAGE_CREDIT');

-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'MESSAGE_CREDIT_PURCHASE';

-- AlterTable
ALTER TABLE "TokenBalance" ADD COLUMN     "messageCreditPurchased" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "messageCreditRp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "messageCreditUsed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "marketingOptOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingOptOutAt" TIMESTAMP(3),
ADD COLUMN     "marketingOptOutSource" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "billable" BOOLEAN,
ADD COLUMN     "billingReconciledAt" TIMESTAMP(3),
ADD COLUMN     "billingRefundedAt" TIMESTAMP(3),
ADD COLUMN     "creditChargedRp" INTEGER,
ADD COLUMN     "creditUserId" TEXT,
ADD COLUMN     "pricingCategory" TEXT,
ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "TokenPackage" ADD COLUMN     "kind" "TokenPackageKind" NOT NULL DEFAULT 'TOKEN';

-- CreateTable
CREATE TABLE "MessageCreditRate" (
    "id" TEXT NOT NULL,
    "category" "MetaTemplateCategory" NOT NULL,
    "priceRp" INTEGER NOT NULL,
    "metaUsd" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageCreditRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageCreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountRp" INTEGER NOT NULL,
    "type" "MessageCreditTxType" NOT NULL,
    "category" "MetaTemplateCategory",
    "description" TEXT,
    "reference" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageCreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WabaTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" "MetaTemplateCategory" NOT NULL,
    "status" "MetaTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "metaTemplateId" TEXT,
    "purposeKey" TEXT,
    "headerType" TEXT,
    "headerText" TEXT,
    "headerTextExample" TEXT,
    "headerMediaHandle" TEXT,
    "headerMediaUrl" TEXT,
    "bodyText" TEXT NOT NULL,
    "bodyExamples" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "footerText" TEXT,
    "buttons" JSONB,
    "authAddSecurityRecommendation" BOOLEAN NOT NULL DEFAULT true,
    "authCodeExpirationMinutes" INTEGER,
    "rejectionReason" TEXT,
    "qualityScore" TEXT,
    "componentsSnapshot" JSONB,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WabaTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingPreferenceLog" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "detail" TEXT,
    "metaTimestamp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingPreferenceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageCreditRate_category_key" ON "MessageCreditRate"("category");

-- CreateIndex
CREATE INDEX "MessageCreditTransaction_userId_createdAt_idx" ON "MessageCreditTransaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageCreditTransaction_userId_reference_type_key" ON "MessageCreditTransaction"("userId", "reference", "type");

-- CreateIndex
CREATE UNIQUE INDEX "WabaTemplate_metaTemplateId_key" ON "WabaTemplate"("metaTemplateId");

-- CreateIndex
CREATE INDEX "WabaTemplate_userId_status_idx" ON "WabaTemplate"("userId", "status");

-- CreateIndex
CREATE INDEX "WabaTemplate_wabaId_purposeKey_idx" ON "WabaTemplate"("wabaId", "purposeKey");

-- CreateIndex
CREATE UNIQUE INDEX "WabaTemplate_wabaId_name_language_key" ON "WabaTemplate"("wabaId", "name", "language");

-- CreateIndex
CREATE INDEX "MarketingPreferenceLog_contactId_createdAt_idx" ON "MarketingPreferenceLog"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_templateId_idx" ON "Message"("templateId");

-- AddForeignKey
ALTER TABLE "MessageCreditTransaction" ADD CONSTRAINT "MessageCreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WabaTemplate" ADD CONSTRAINT "WabaTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPreferenceLog" ADD CONSTRAINT "MarketingPreferenceLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WabaTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Seed harga Kredit Pesan per kategori (PLACEHOLDER — admin wajib menyesuaikan
-- dengan rate card Meta Indonesia × kurs × margin di /admin/message-credits).
INSERT INTO "MessageCreditRate" ("id", "category", "priceRp", "metaUsd", "updatedAt") VALUES
  ('mcr_utility', 'UTILITY', 500, 0.0200, CURRENT_TIMESTAMP),
  ('mcr_marketing', 'MARKETING', 1000, 0.0411, CURRENT_TIMESTAMP),
  ('mcr_authentication', 'AUTHENTICATION', 750, 0.0300, CURRENT_TIMESTAMP)
ON CONFLICT ("category") DO NOTHING;
