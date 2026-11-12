import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { canViewGroup } from "@/lib/server/access";

/**
 * Access gate for /groups/[id]. It runs above this route's loading.tsx (a Suspense boundary), so a
 * group the user can't open is answered with HTTP 404 before any of the page is streamed. The
 * page's own query still enforces access; this only makes the status code honest.
 */
export default async function GroupLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  if (!(await canViewGroup(user.id, id))) notFound();
  return children;
}
