-- DropForeignKey
ALTER TABLE "UserOrder" DROP CONSTRAINT "UserOrder_contactId_fkey";

-- AlterTable
ALTER TABLE "UserOrder" ALTER COLUMN "contactId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "UserOrder" ADD CONSTRAINT "UserOrder_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

