
-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Expense_clientId_key" ON "Expense"("clientId");

