"use server";

import { requireUser } from "@/lib/auth/session";
import { searchExpenses, type SearchFilters } from "@/lib/server/search";
import { guard } from "./run";

/** Read-only (no revalidation): powers search/filter-as-you-type and "Show more". */
export async function searchExpensesAction(filters: SearchFilters) {
  const user = await requireUser();
  return guard(() => searchExpenses(user.id, filters));
}
