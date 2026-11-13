import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { withNext } from "@/components/auth/safe-next";
import { listNames, memberCount } from "@/components/groups/format";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/page";
import { getCurrentUser } from "@/lib/auth/session";
import { ARCHIVED_INVITE, getInvitePreview, INVALID_INVITE } from "@/lib/server/invites";
import { JoinButton } from "./join-button";

type Props = { params: Promise<{ token: string }> };

// One lookup per request, shared by generateMetadata and the page.
const load = cache(async (token: string) => {
  const user = await getCurrentUser();
  const preview = await getInvitePreview(token, user?.id);
  return { user, preview };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const { preview } = await load(token);
  // Invite links get pasted into chats; keep them out of search results.
  return { title: preview ? `Join ${preview.name}` : "Invite link", robots: { index: false, follow: false } };
}

export default async function JoinPage({ params }: Props) {
  const { token } = await params;
  const { user, preview } = await load(token);

  if (!preview) {
    return (
      <>
        <h1 className="text-heading font-bold">This invite link doesn&apos;t work</h1>
        <p className="mt-2 text-body-sm text-ink-muted">{INVALID_INVITE}</p>
        <Button asChild size="lg" className="mt-6">
          <Link href="/">Go to BillSplit</Link>
        </Button>
      </>
    );
  }

  const groupCard = <GroupCard preview={preview} />;

  if (user && preview.alreadyMember) {
    return (
      <>
        <h1 className="text-heading font-bold">You&apos;re already in {preview.name}</h1>
        <p className="mt-2 text-body-sm text-ink-muted">This is the group&apos;s invite link. Share it with anyone else who should join.</p>
        <div className="mt-6">{groupCard}</div>
        <Button asChild size="lg" className="mt-6 w-full">
          <Link href={`/groups/${preview.groupId}`}>Open group</Link>
        </Button>
      </>
    );
  }

  if (preview.archived) {
    return (
      <>
        <h1 className="text-heading font-bold">You can&apos;t join {preview.name} right now</h1>
        <p className="mt-2 text-body-sm text-ink-muted">{ARCHIVED_INVITE}</p>
        <div className="mt-6">{groupCard}</div>
        <Button asChild variant="secondary" size="lg" className="mt-6 w-full">
          <Link href={user ? "/home" : "/"}>Go to BillSplit</Link>
        </Button>
      </>
    );
  }

  if (user) {
    return (
      <>
        <h1 className="text-heading font-bold">Join {preview.name}</h1>
        <p className="mt-2 text-body-sm text-ink-muted">
          You&apos;ll see the group&apos;s expenses and balances, and everyone in it becomes your friend on BillSplit.
        </p>
        <div className="mt-6">{groupCard}</div>
        <div className="mt-6">
          <JoinButton token={token} groupName={preview.name} />
        </div>
        <p className="mt-3 text-meta text-ink-muted">
          Joining as {user.name} ({user.email}).
        </p>
      </>
    );
  }

  const next = `/join/${token}`;
  return (
    <>
      <h1 className="text-heading font-bold">Join {preview.name}</h1>
      <p className="mt-2 text-body-sm text-ink-muted">
        You&apos;ve been invited to split costs in {preview.name} on BillSplit. Log in or create an account, then join.
      </p>
      <div className="mt-6">{groupCard}</div>
      <div className="mt-6 space-y-3">
        <Button asChild size="lg" className="w-full">
          <Link href={withNext("/login", next)}>Log in to join</Link>
        </Button>
        <Button asChild variant="secondary" size="lg" className="w-full">
          <Link href={withNext("/register", next)}>Create an account to join</Link>
        </Button>
      </div>
    </>
  );
}

function GroupCard({ preview }: { preview: { groupId: string; name: string; currency: string; memberCount: number; memberNames: string[] } }) {
  return (
    <Panel className="flex items-start gap-4">
      <Avatar id={preview.groupId} name={preview.name} size={48} />
      <div className="min-w-0">
        <p className="truncate text-title font-bold">{preview.name}</p>
        <p className="mt-0.5 text-body-sm text-ink-muted">{memberCount(preview.memberCount)}</p>
        {preview.memberNames.length ? (
          <p className="mt-1 text-body-sm">{listNames(preview.memberNames, preview.memberCount)}</p>
        ) : null}
        <p className="mt-1 text-meta text-ink-muted">Amounts in {preview.currency}</p>
      </div>
    </Panel>
  );
}
