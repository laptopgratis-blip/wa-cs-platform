-- Testimoni / review order (Fase 3)
-- OrderReview: 1 review per order (orderId unique). Diisi customer via link
-- {link_review} 1-klik. approved=false → owner kurasi sebelum jadi social proof.

-- CreateTable
CREATE TABLE "OrderReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "productName" TEXT,
    "rating" INTEGER NOT NULL,
    "reviewText" TEXT,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "triedProduct" BOOLEAN NOT NULL DEFAULT true,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'REVIEW_LINK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderReview_orderId_key" ON "OrderReview"("orderId");

-- CreateIndex
CREATE INDEX "OrderReview_userId_createdAt_idx" ON "OrderReview"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OrderReview_userId_approved_idx" ON "OrderReview"("userId", "approved");

-- AddForeignKey
ALTER TABLE "OrderReview" ADD CONSTRAINT "OrderReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "UserOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReview" ADD CONSTRAINT "OrderReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
