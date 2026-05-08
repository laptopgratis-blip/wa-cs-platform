-- AlterTable
ALTER TABLE "UserOrder" ADD COLUMN "notesAdmin" TEXT;

-- AddForeignKey: UserOrder.orderFormId → OrderForm.id (relation OrderFormSubmissions).
-- Sebelum applied: 0 dangling references verified manually.
ALTER TABLE "UserOrder"
  ADD CONSTRAINT "UserOrder_orderFormId_fkey"
  FOREIGN KEY ("orderFormId") REFERENCES "OrderForm"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: OrderTag
CREATE TABLE "OrderTag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderTag_userId_name_key" ON "OrderTag"("userId", "name");
CREATE INDEX "OrderTag_userId_idx" ON "OrderTag"("userId");

ALTER TABLE "OrderTag"
  ADD CONSTRAINT "OrderTag_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: implicit many-to-many join (Prisma convention name: _OrderTags).
CREATE TABLE "_OrderTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_OrderTags_AB_unique" ON "_OrderTags"("A", "B");
CREATE INDEX "_OrderTags_B_index" ON "_OrderTags"("B");

ALTER TABLE "_OrderTags"
  ADD CONSTRAINT "_OrderTags_A_fkey"
  FOREIGN KEY ("A") REFERENCES "OrderTag"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_OrderTags"
  ADD CONSTRAINT "_OrderTags_B_fkey"
  FOREIGN KEY ("B") REFERENCES "UserOrder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: UserOrderViewPreference
CREATE TABLE "UserOrderViewPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "visibleColumns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "columnOrder" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "filters" JSONB,
    "sortColumn" TEXT,
    "sortDirection" TEXT,
    "pageSize" INTEGER NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOrderViewPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserOrderViewPreference_userId_key" ON "UserOrderViewPreference"("userId");

ALTER TABLE "UserOrderViewPreference"
  ADD CONSTRAINT "UserOrderViewPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
