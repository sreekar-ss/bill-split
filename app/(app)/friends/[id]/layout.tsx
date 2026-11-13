import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { canViewFriend } from "@/lib/server/access";

/**
 * Access gate for /friends/[id]: a friend the user can't open is answered with HTTP 404 before any of the
 * page (or a Suspense boundary inside it) is streamed. The page's own query still enforces access;
 * this only makes the status code honest.
 */
export default async function FriendLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  if (!(await canViewFriend(user.id, id))) notFound();
  return children;
}
