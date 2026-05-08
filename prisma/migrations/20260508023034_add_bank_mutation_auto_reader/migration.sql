-- AlterTable
ALTER TABLE "UserOrder" ADD COLUMN     "autoConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "autoConfirmedBy" TEXT,
ADD COLUMN     "matchedMutationId" TEXT;

-- CreateTable
CREATE TABLE "BankMutationIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL DEFAULT 'BCA',
    "bcaUserId" TEXT NOT NULL,
    "bcaPin" TEXT NOT NULL,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "accountBalance" DOUBLE PRECISION,
    "cookieData" TEXT,
    "sessionExpiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBetaConsented" BOOLEAN NOT NULL DEFAULT false,
    "isAdminBlocked" BOOLEAN NOT NULL DEFAULT false,
    "lastScrapedAt" TIMESTAMP(3),
    "lastScrapeStatus" TEXT,
    "lastScrapeError" TEXT,
    "scrapeIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "autoConfirmEnabled" BOOLEAN NOT NULL DEFAULT true,
    "matchByExactAmount" BOOLEAN NOT NULL DEFAULT true,
    "matchByCustomerName" BOOLEAN NOT NULL DEFAULT false,
    "totalMutationsCaptured" INTEGER NOT NULL DEFAULT 0,
    "totalAutoConfirmed" INTEGER NOT NULL DEFAULT 0,
    "totalScrapes" INTEGER NOT NULL DEFAULT 0,
    "totalScrapeFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankMutationIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankMutation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "mutationDate" TIMESTAMP(3) NOT NULL,
    "mutationType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "branch" TEXT,
    "balance" DOUBLE PRECISION,
    "mutationHash" TEXT NOT NULL,
    "matchedOrderId" TEXT,
    "matchAction" TEXT,
    "matchScore" DOUBLE PRECISION,
    "rawHtml" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankMutation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankScrapeJob" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "mutationsFound" INTEGER NOT NULL DEFAULT 0,
    "newMutations" INTEGER NOT NULL DEFAULT 0,
    "autoConfirmed" INTEGER NOT NULL DEFAULT 0,
    "screenshotPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankScrapeJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankMutationIntegration_userId_key" ON "BankMutationIntegration"("userId");

-- CreateIndex
CREATE INDEX "BankMutationIntegration_isActive_isAdminBlocked_lastScraped_idx" ON "BankMutationIntegration"("isActive", "isAdminBlocked", "lastScrapedAt");

-- CreateIndex
CREATE INDEX "BankMutation_userId_mutationDate_idx" ON "BankMutation"("userId", "mutationDate" DESC);

-- CreateIndex
CREATE INDEX "BankMutation_matchedOrderId_idx" ON "BankMutation"("matchedOrderId");

-- CreateIndex
CREATE INDEX "BankMutation_userId_matchAction_idx" ON "BankMutation"("userId", "matchAction");

-- CreateIndex
CREATE UNIQUE INDEX "BankMutation_integrationId_mutationHash_key" ON "BankMutation"("integrationId", "mutationHash");

-- CreateIndex
CREATE INDEX "BankScrapeJob_integrationId_createdAt_idx" ON "BankScrapeJob"("integrationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BankScrapeJob_status_createdAt_idx" ON "BankScrapeJob"("status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "BankMutationIntegration" ADD CONSTRAINT "BankMutationIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMutation" ADD CONSTRAINT "BankMutation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMutation" ADD CONSTRAINT "BankMutation_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "BankMutationIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankScrapeJob" ADD CONSTRAINT "BankScrapeJob_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "BankMutationIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
