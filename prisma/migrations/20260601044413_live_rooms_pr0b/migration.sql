-- CreateTable
CREATE TABLE "LiveRoom" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hostTemplateId" TEXT NOT NULL,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "systemPrompt" TEXT NOT NULL,
    "greeting" TEXT,
    "ttsVoice" TEXT NOT NULL DEFAULT 'alloy',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveRoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveRoom_slug_key" ON "LiveRoom"("slug");

-- CreateIndex
CREATE INDEX "LiveRoom_userId_createdAt_idx" ON "LiveRoom"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveRoom_slug_idx" ON "LiveRoom"("slug");

-- AddForeignKey
ALTER TABLE "LiveRoom" ADD CONSTRAINT "LiveRoom_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRoom" ADD CONSTRAINT "LiveRoom_hostTemplateId_fkey" FOREIGN KEY ("hostTemplateId") REFERENCES "HostTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
