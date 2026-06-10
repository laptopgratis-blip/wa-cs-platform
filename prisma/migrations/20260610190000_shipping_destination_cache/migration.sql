-- Cache persisten hasil search destinasi Komerce (anti kuota jebol).
CREATE TABLE "ShippingDestinationCache" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShippingDestinationCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShippingDestinationCache_query_key" ON "ShippingDestinationCache"("query");
