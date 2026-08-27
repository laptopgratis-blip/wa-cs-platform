-- CreateTable
CREATE TABLE "SellerApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" VARCHAR(24) NOT NULL,
    "lastFour" VARCHAR(4) NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['read']::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SellerApiKey_keyHash_key" ON "SellerApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "SellerApiKey_userId_revokedAt_idx" ON "SellerApiKey"("userId", "revokedAt");

-- AddForeignKey
ALTER TABLE "SellerApiKey" ADD CONSTRAINT "SellerApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

