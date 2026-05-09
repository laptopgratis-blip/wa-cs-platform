-- CreateTable
CREATE TABLE "StudentMagicLink" (
    "id" TEXT NOT NULL,
    "studentPhone" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "channel" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentMagicLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentMagicLink_token_key" ON "StudentMagicLink"("token");

-- CreateIndex
CREATE INDEX "StudentMagicLink_studentPhone_revokedAt_idx" ON "StudentMagicLink"("studentPhone", "revokedAt");

-- CreateIndex
CREATE INDEX "StudentMagicLink_expiresAt_idx" ON "StudentMagicLink"("expiresAt");
