-- MVP1: integer-cent money, explicit payer, derived ledger.
-- Data-preserving: converts existing Float amounts to cents and backfills payer = creator.

-- User: session invalidation counter
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Expense: amount -> amountCents, add paidById (backfilled from createdById)
ALTER TABLE "Expense" ADD COLUMN "amountCents" INTEGER;
UPDATE "Expense" SET "amountCents" = ROUND("amount" * 100)::INTEGER;
ALTER TABLE "Expense" ALTER COLUMN "amountCents" SET NOT NULL;
ALTER TABLE "Expense" DROP COLUMN "amount";

ALTER TABLE "Expense" ADD COLUMN "paidById" TEXT;
UPDATE "Expense" SET "paidById" = "createdById";
ALTER TABLE "Expense" ALTER COLUMN "paidById" SET NOT NULL;
CREATE INDEX "Expense_paidById_idx" ON "Expense"("paidById");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ExpenseSplit: amount -> amountCents, add shares, one row per (expense, user)
ALTER TABLE "ExpenseSplit" ADD COLUMN "amountCents" INTEGER;
UPDATE "ExpenseSplit" SET "amountCents" = ROUND("amount" * 100)::INTEGER;
ALTER TABLE "ExpenseSplit" ALTER COLUMN "amountCents" SET NOT NULL;
ALTER TABLE "ExpenseSplit" DROP COLUMN "amount";
ALTER TABLE "ExpenseSplit" ADD COLUMN "shares" DOUBLE PRECISION;
DROP INDEX IF EXISTS "ExpenseSplit_settled_idx";
CREATE UNIQUE INDEX "ExpenseSplit_expenseId_userId_key" ON "ExpenseSplit"("expenseId", "userId");

-- Fix rounding drift from the Float era: make each expense's shares sum exactly to its amount
-- by adjusting the largest share (ties broken by userId).
WITH sums AS (
  SELECT e."id" AS "expenseId", e."amountCents" - COALESCE(SUM(s."amountCents"), 0) AS diff
  FROM "Expense" e JOIN "ExpenseSplit" s ON s."expenseId" = e."id"
  GROUP BY e."id", e."amountCents"
  HAVING e."amountCents" - COALESCE(SUM(s."amountCents"), 0) <> 0
), target AS (
  SELECT DISTINCT ON (s."expenseId") s."id", sums.diff
  FROM "ExpenseSplit" s JOIN sums ON sums."expenseId" = s."expenseId"
  ORDER BY s."expenseId", s."amountCents" DESC, s."userId"
)
UPDATE "ExpenseSplit" s SET "amountCents" = s."amountCents" + target.diff
FROM target WHERE s."id" = target."id";

-- Settlement: amount -> amountCents, recorder, cascade with group
ALTER TABLE "Settlement" ADD COLUMN "amountCents" INTEGER;
UPDATE "Settlement" SET "amountCents" = ROUND("amount" * 100)::INTEGER;
ALTER TABLE "Settlement" ALTER COLUMN "amountCents" SET NOT NULL;
ALTER TABLE "Settlement" DROP COLUMN "amount";
ALTER TABLE "Settlement" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Settlement" DROP CONSTRAINT "Settlement_groupId_fkey";
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Settlement_settledAt_idx" ON "Settlement"("settledAt");
