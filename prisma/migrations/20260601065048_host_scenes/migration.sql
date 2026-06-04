-- CreateEnum
CREATE TYPE "HostSceneStatus" AS ENUM ('DRAFT', 'GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "HostScene" (
    "id" TEXT NOT NULL,
    "hostTemplateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "promptVideo" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'CUSTOM',
    "videoUrl" TEXT,
    "videoSeconds" INTEGER,
    "status" "HostSceneStatus" NOT NULL DEFAULT 'DRAFT',
    "errorMessage" TEXT,
    "generationJobId" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostScene_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HostScene_hostTemplateId_sortOrder_idx" ON "HostScene"("hostTemplateId", "sortOrder");

-- CreateIndex
CREATE INDEX "HostScene_userId_createdAt_idx" ON "HostScene"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "HostScene" ADD CONSTRAINT "HostScene_hostTemplateId_fkey" FOREIGN KEY ("hostTemplateId") REFERENCES "HostTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
