import Link from "next/link";
import { LinkPending } from "@/components/shell/nav-progress";

/**
 * next/link for pages inside the app: while the next page loads, the top-of-screen bar shows the
 * tap registered (pages have no loading skeletons). Rows in long lists pass prefetch={false}, so a
 * screenful of rows doesn't preload a screenful of pages.
 */
export function AppLink({ children, ...props }: React.ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <LinkPending />
    </Link>
  );
}
