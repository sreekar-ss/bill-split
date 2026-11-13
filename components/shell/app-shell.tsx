"use client";

import { Activity, CircleUserRound, House, Plus, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExpenseSheet } from "@/components/expenses/expense-sheet";
import type { ExpenseDetail } from "@/lib/server/expenses";
import type { ExpenseContexts } from "@/lib/server/groups";
import { cn } from "@/lib/utils/cn";
import { InstallAppProvider } from "@/components/pwa/install-app";
import { NotificationPrompt } from "@/components/pwa/notification-prompt";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";
import { OfflineSyncProvider } from "@/components/pwa/offline-sync";
import { AddExpenseContext, type AddExpensePreset } from "./add-expense-context";

const NAV = [
  { href: "/home", label: "Home", icon: House },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/friends", label: "Friends", icon: User },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/account", label: "Account", icon: CircleUserRound },
] as const;

export function AppShell({ contexts, pushKey = null, children }: { contexts: ExpenseContexts; pushKey?: string | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState<{ open: boolean; preset?: AddExpensePreset; editing?: ExpenseDetail }>({ open: false });
  const canAddExpense = contexts.groups.length > 0 || contexts.friends.length > 0;

  const openAddExpense = useCallback((preset?: AddExpensePreset) => setSheet({ open: true, preset }), []);
  const openEditExpense = useCallback((editing: ExpenseDetail) => setSheet({ open: true, editing }), []);
  const api = useMemo(() => ({ openAddExpense, openEditExpense, canAddExpense }), [openAddExpense, openEditExpense, canAddExpense]);

  // Preset the sheet from the page we're on (group or friend page).
  // An archived group isn't in contexts.groups (it's read-only), so its page offers no Add expense.
  const routeGroupId = pathname.match(/^\/groups\/([^/]+)/)?.[1];
  const onArchivedGroup = Boolean(routeGroupId) && !contexts.groups.some((g) => g.id === routeGroupId);
  const routePreset = useMemo<AddExpensePreset | undefined>(() => {
    if (routeGroupId) return contexts.groups.some((g) => g.id === routeGroupId) ? { groupId: routeGroupId } : undefined;
    const f = pathname.match(/^\/friends\/([^/]+)/);
    if (f) return { friendId: f[1] };
    return undefined;
  }, [pathname, routeGroupId, contexts.groups]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const showAdd = canAddExpense && !onArchivedGroup;
  // While someone is typing in a page field (e.g. a comment), the floating pill would sit over it
  // and the keyboard: hide it until focus leaves the field. Fields inside sheets don't count.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement && t.matches("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=true]") && !t.closest("[role=dialog]");
    const onIn = (e: FocusEvent) => setTyping(isField(e.target));
    const onOut = () => setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  const showPill = showAdd && !typing && !pathname.startsWith("/account");

  return (
    <AddExpenseContext.Provider value={api}>
      <OfflineSyncProvider userId={contexts.me.id}>
      <InstallAppProvider engaged={canAddExpense}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[10px] focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="lg:flex">
        {/* Desktop rail */}
        <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-rule px-4 py-6 lg:flex">
          <Link href="/home" className="mb-8 px-3 text-title font-bold tracking-tight">
            BillSplit
          </Link>
          {showAdd && (
            <button
              type="button"
              onClick={() => openAddExpense(routePreset)}
              className="mb-6 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-highlight px-5 font-semibold text-highlight-ink shadow-lift hover:brightness-95"
            >
              <Plus className="size-5" aria-hidden />
              Add expense
            </button>
          )}
          <ul className="space-y-1">
            {NAV.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-[10px] px-3 text-ink-muted hover:bg-ink/5 hover:text-ink",
                    isActive(href) && "bg-ink/[0.06] font-semibold text-ink",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main" className="mx-auto w-full min-w-0 max-w-[1100px] px-4 pb-[calc(160px+env(safe-area-inset-bottom))] pt-6 md:px-6 lg:pb-12 lg:pt-10">
          <OfflineIndicator />
          {children}
        </main>
      </div>

      {/* Mobile add pill */}
      {showPill && (
        <button
          type="button"
          onClick={() => openAddExpense(routePreset)}
          className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-[52px] items-center gap-2 rounded-full bg-highlight pl-4 pr-[22px] font-semibold text-highlight-ink shadow-lift hover:brightness-95 lg:hidden"
        >
          <Plus className="size-5" aria-hidden />
          Add expense
        </button>
      )}

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="grid h-[60px] grid-cols-5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-full flex-col items-center justify-center gap-0.5 text-meta text-ink-muted",
                    active && "font-semibold text-ink before:absolute before:inset-x-5 before:top-0 before:h-[3px] before:rounded-b before:bg-ink",
                  )}
                >
                  <Icon className="size-[22px]" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <ExpenseSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        contexts={contexts}
        preset={sheet.preset}
        editing={sheet.editing}
      />
        <NotificationPrompt publicKey={pushKey} engaged={canAddExpense} />
      </InstallAppProvider>
      </OfflineSyncProvider>
    </AddExpenseContext.Provider>
  );
}
