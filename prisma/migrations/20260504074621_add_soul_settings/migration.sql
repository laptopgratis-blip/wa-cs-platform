-- CreateTable
CREATE TABLE "SoulPersonality" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "systemPromptSnippet" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoulPersonality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoulStyle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "systemPromptSnippet" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoulStyle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SoulPersonality_isActive_order_idx" ON "SoulPersonality"("isActive", "order");

-- CreateIndex
CREATE INDEX "SoulStyle_isActive_order_idx" ON "SoulStyle"("isActive", "order");
