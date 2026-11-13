-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_expenseId_fkey";

-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_groupId_fkey";

-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_settlementId_fkey";

-- DropForeignKey
ALTER TABLE "ExpenseItem" DROP CONSTRAINT "ExpenseItem_expenseId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey";

-- DropTable
DROP TABLE "Activity";

-- DropTable
DROP TABLE "Category";

-- DropTable
DROP TABLE "ExpenseItem";

-- DropTable
DROP TABLE "Notification";

