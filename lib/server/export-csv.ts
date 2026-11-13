import "server-only";
import { toDateInput } from "@/lib/domain/dates";
import { centsToInput } from "@/lib/domain/money";
import { displayName } from "@/lib/utils/person";
import { canViewGroup } from "./access";
import { db } from "./db";
import { notFound } from "./errors";

/**
 * A group's expenses and payments as CSV for spreadsheets. One column per person with their share.
 * Cells that a spreadsheet would treat as a formula (=, +, -, @, tab, CR) are prefixed with an
 * apostrophe, so a malicious description can't run anything in someone's spreadsheet.
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportGroupCsv(userId: string, groupId: string) {
  if (!(await canViewGroup(userId, groupId))) throw notFound("group");
  const group = await db.group.findUniqueOrThrow({
    where: { id: groupId },
    select: {
      name: true,
      currency: true,
      members: { select: { user: { select: { id: true, name: true, status: true } } }, orderBy: { joinedAt: "asc" } },
      expenses: {
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: {
          date: true, description: true, category: true, amountCents: true, notes: true,
          paidBy: { select: { id: true, name: true, status: true } },
          splits: { select: { amountCents: true, user: { select: { id: true, name: true, status: true } } } },
        },
      },
      settlements: {
        orderBy: [{ settledAt: "asc" }, { createdAt: "asc" }],
        select: { settledAt: true, amountCents: true, note: true, fromUser: { select: { name: true, status: true } }, toUser: { select: { name: true, status: true } } },
      },
    },
  });

  // Everyone who appears anywhere (current members first, then former ones).
  const people = new Map<string, string>();
  for (const m of group.members) people.set(m.user.id, displayName(m.user));
  for (const e of group.expenses) for (const s of e.splits) if (!people.has(s.user.id)) people.set(s.user.id, displayName(s.user));
  const personIds = [...people.keys()];

  const header = ["Date", "Type", "Description", "Category", "Paid by", "Amount", "Currency", ...personIds.map((id) => `${people.get(id)} share`), "Notes"];
  const rows: (string | number)[][] = [];
  for (const e of group.expenses) {
    const share = new Map(e.splits.map((s) => [s.user.id, s.amountCents]));
    rows.push([
      toDateInput(e.date), "Expense", e.description, e.category, displayName(e.paidBy), centsToInput(e.amountCents), group.currency,
      ...personIds.map((id) => (share.get(id) ? centsToInput(share.get(id)!) : "")), e.notes ?? "",
    ]);
  }
  for (const p of group.settlements) {
    rows.push([
      toDateInput(p.settledAt), "Payment", `${displayName(p.fromUser)} paid ${displayName(p.toUser)}`, "", displayName(p.fromUser),
      centsToInput(p.amountCents), group.currency, ...personIds.map(() => ""), p.note ?? "",
    ]);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  const slug = group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "group";
  return { csv, filename: `${slug}-billsplit-${toDateInput(new Date())}.csv` };
}
