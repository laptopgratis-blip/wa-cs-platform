-- CreateTable
CREATE TABLE "StudentSession" (
    "id" TEXT NOT NULL,
    "studentPhone" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "studentName" TEXT,
    "studentEmail" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentOtp" (
    "id" TEXT NOT NULL,
    "studentPhone" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentSession_sessionToken_key" ON "StudentSession"("sessionToken");

-- CreateIndex
CREATE INDEX "StudentSession_studentPhone_idx" ON "StudentSession"("studentPhone");

-- CreateIndex
CREATE INDEX "StudentSession_expiresAt_idx" ON "StudentSession"("expiresAt");

-- CreateIndex
CREATE INDEX "StudentOtp_studentPhone_createdAt_idx" ON "StudentOtp"("studentPhone", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StudentOtp_expiresAt_idx" ON "StudentOtp"("expiresAt");

