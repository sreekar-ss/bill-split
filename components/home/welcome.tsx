import { UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/page";

/** First-run Home: nobody to split with yet, so offer the two ways to start. */
export function Welcome({ name }: { name: string }) {
  const first = name.trim().split(/\s+/)[0];
  return (
    <Panel className="mt-2" role="region" aria-label="Get started">
      <h2 className="text-title font-bold">Welcome{first ? `, ${first}` : ""}</h2>
      <p className="mt-2 max-w-[52ch] text-body-sm text-ink-muted">
        BillSplit keeps track of who paid for what, so everyone knows who owes whom. Start a group for a trip or a shared flat,
        or add a friend to split costs with just the two of you.
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href="/groups">
            <Users aria-hidden />
            Create a group
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/friends?add=1">
            <UserPlus aria-hidden />
            Add a friend
          </Link>
        </Button>
      </div>
    </Panel>
  );
}
