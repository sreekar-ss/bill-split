import "server-only";
import { db } from "./db";

/**
 * Whether an expense belongs to an archived group (read-only until unarchived). Direct expenses are
 * never archived. Callers must already have checked access (e.g. via getExpense / canViewExpense).
 */
export async function isExpenseArchived(expenseId: string): Promise<boolean> {
  const e = await db.expense.findUnique({ where: { id: expenseId }, select: { group: { select: { archivedAt: true } } } });
  return Boolean(e?.group?.archivedAt);
}
