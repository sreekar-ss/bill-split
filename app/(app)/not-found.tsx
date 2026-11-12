import Link from "next/link";
import { Button } from "@/components/ui/button";

/** 404 inside the app shell, e.g. a group you were removed from or a deleted expense. */
export default function AppNotFound() {
  return (
    <div className="max-w-[46ch] py-8">
      <h1 className="text-heading font-bold">We couldn&apos;t find that</h1>
      <p className="mt-2 text-body-sm text-ink-muted">
        It may have been deleted, or you may no longer be a member of the group it belongs to. Check the link, or head back to your
        balances.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/home">Go to home</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/groups">See your groups</Link>
        </Button>
      </div>
    </div>
  );
}
