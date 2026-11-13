
-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "recurrenceKey" TEXT,
ADD COLUMN     "recurringId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastDigestAt" TIMESTAMP(3),
ADD COLUMN     "notifyExpenses" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyPayments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyReminders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "weeklyDigest" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "groupId" TEXT,
    "friendId" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "notes" TEXT,
    "paidById" TEXT NOT NULL,
    "splitMethod" TEXT NOT NULL,
    "splitEntries" JSONB NOT NULL,
    "frequency" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "anchorDay" INTEGER NOT NULL,
    "nextRunOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3),
    "lastRunOn" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringExpense_nextRunOn_idx" ON "RecurringExpense"("nextRunOn");

-- CreateIndex
CREATE INDEX "RecurringExpense_groupId_idx" ON "RecurringExpense"("groupId");

-- CreateIndex
CREATE INDEX "RecurringExpense_createdById_idx" ON "RecurringExpense"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_recurrenceKey_key" ON "Expense"("recurrenceKey");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

