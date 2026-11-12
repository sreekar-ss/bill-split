import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { canViewExpense } from "@/lib/server/access";

/**
 * Access gate for /expenses/[id]. It runs above this route's loading.tsx (a Suspense boundary), so a
 * expense the user can't open is answered with HTTP 404 before any of the page is streamed. The
 * page's own query still enforces access; this only makes the status code honest.
 */
export default async function ExpenseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  if (!(await canViewExpense(user.id, id))) notFound();
  return children;
}
