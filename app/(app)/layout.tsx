import { cookies } from "next/headers";
import { Suspense } from "react";
import { VerifyBanner } from "@/components/account/verify-banner";
import { ResetToast } from "@/components/auth/reset-toast";
import { VERIFY_BANNER_COOKIE } from "@/components/auth/verify-banner-cookie";
import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/auth/session";
import { getExpenseContexts } from "@/lib/server/groups";
import { pushPublicKey } from "@/lib/server/push";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [contexts, jar] = await Promise.all([getExpenseContexts(user.id), cookies()]);
  // Hidden for the rest of this browser session once dismissed (the cookie holds the user id).
  const showVerifyBanner = !user.emailVerified && jar.get(VERIFY_BANNER_COOKIE)?.value !== user.id;
  return (
    <AppShell contexts={contexts} pushKey={pushPublicKey()}>
      {showVerifyBanner ? <VerifyBanner email={user.email} userId={user.id} /> : null}
      {children}
      <Suspense fallback={null}>
        <ResetToast />
      </Suspense>
    </AppShell>
  );
}
