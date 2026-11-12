import "server-only";
import { db } from "./db";

/**
 * Payment handles (Venmo, PayPal.me, Cash App, UPI — a UPI ID is often a phone number) are only
 * shown to people the owner has chosen to deal with. Being added to a group or as a friend is
 * one-sided (anyone who knows your email can do it), so that alone doesn't count. The owner has
 * taken part when they:
 *   - started the friendship with the viewer (added them, or joined a group the viewer was in by link), or
 *   - created a shared group, or wrote something into it (an expense or a payment), or
 *   - recorded a direct expense or payment with the viewer.
 */
export const HIDDEN_HANDLES = { venmoHandle: null, paypalMe: null, cashTag: null, upiId: null } as const;

/** Of a group's members, those whose payment handles the viewer may see. */
export async function membersSharingHandles(groupId: string, viewerId: string, memberIds: string[]): Promise<Set<string>> {
  const others = memberIds.filter((id) => id !== viewerId);
  const visible = new Set<string>([viewerId]);
  if (others.length === 0) return visible;
  const [group, expenseAuthors, paymentAuthors, initiated] = await Promise.all([
    db.group.findUnique({ where: { id: groupId }, select: { createdById: true } }),
    db.expense.findMany({ where: { groupId, createdById: { in: others } }, select: { createdById: true }, distinct: ["createdById"] }),
    db.settlement.findMany({ where: { groupId, createdById: { in: others } }, select: { createdById: true }, distinct: ["createdById"] }),
    db.friendship.findMany({ where: { friendId: viewerId, userId: { in: others } }, select: { userId: true } }),
  ]);
  if (group) visible.add(group.createdById);
  for (const e of expenseAuthors) visible.add(e.createdById);
  for (const s of paymentAuthors) if (s.createdById) visible.add(s.createdById);
  for (const f of initiated) visible.add(f.userId);
  return visible;
}

/** Whether `ownerId` has taken part in a relationship with `viewerId` (see above). */
export async function sharesHandlesWith(ownerId: string, viewerId: string): Promise<boolean> {
  if (ownerId === viewerId) return true;
  const involvesViewer = { OR: [{ paidById: viewerId }, { splits: { some: { userId: viewerId } } }] };
  const [initiated, expense, payment, group] = await Promise.all([
    db.friendship.findFirst({ where: { userId: ownerId, friendId: viewerId }, select: { id: true } }),
    db.expense.findFirst({ where: { createdById: ownerId, ...involvesViewer }, select: { id: true } }),
    db.settlement.findFirst({
      where: { createdById: ownerId, OR: [{ fromUserId: viewerId }, { toUserId: viewerId }] },
      select: { id: true },
    }),
    db.group.findFirst({
      where: {
        members: { some: { userId: viewerId } },
        AND: [
          { members: { some: { userId: ownerId } } },
          { OR: [{ createdById: ownerId }, { expenses: { some: { createdById: ownerId } } }, { settlements: { some: { createdById: ownerId } } }] },
        ],
      },
      select: { id: true },
    }),
  ]);
  return Boolean(initiated || expense || payment || group);
}
