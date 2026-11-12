import { Suspense } from "react";
import { ResetToast } from "@/components/auth/reset-toast";
import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/auth/session";
import { getExpenseContexts } from "@/lib/server/groups";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const contexts = await getExpenseContexts(user.id);
  return (
    <AppShell contexts={contexts}>
      {children}
      <Suspense fallback={null}>
        <ResetToast />
      </Suspense>
    </AppShell>
  );
}
