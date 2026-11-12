import "server-only";
import { inviteByEmailSchema } from "@/lib/validation";
import { db, type Tx } from "./db";
import { AppError } from "./errors";
import { parse } from "./parse";
import { hit } from "./rate-limit";

/** New placeholder accounts one person can create per day (each one sends an email). */
export const PLACEHOLDERS_PER_USER_PER_DAY = 20;

export const UNCONFIRMED_INVITEE =
  "That person hasn't confirmed their email address yet. Ask them to open the confirmation link we sent them, then add them again.";

/**
 * Find the person behind an email, or — when nobody has signed up with it — create a
 * placeholder account they can claim later via the emailed invite link.
 * A name is required for new placeholders so the group knows who they are.
 *
 * Only accounts that have proven they own the address (emailVerified) can be found. Otherwise
 * anyone could sign up with someone else's email before they do and be added in their place,
 * seeing the group's expenses and putting their own payment handles in front of the payer.
 */
export async function findOrCreateInvitee(client: Tx | typeof db, input: unknown, inviterId: string) {
  const { email, name } = parse(inviteByEmailSchema, input);
  const existing = await client.user.findUnique({ where: { email }, select: { id: true, name: true, status: true, emailVerified: true } });
  if (existing) {
    if (existing.status === "deleted") throw new AppError("That account was deleted.", "NOT_FOUND", { email: "That account was deleted." });
    if (existing.id === inviterId) throw new AppError("That's your own email.", "VALIDATION", { email: "That's your own email." });
    if (existing.status === "active" && !existing.emailVerified) {
      throw new AppError(UNCONFIRMED_INVITEE, "CONFLICT", { email: "Not confirmed yet." });
    }
    return { user: { id: existing.id, name: existing.name, status: existing.status }, created: false };
  }
  // Each placeholder sends an email from our domain, so only confirmed accounts can create them, and only so many.
  const inviter = await client.user.findUniqueOrThrow({ where: { id: inviterId }, select: { emailVerified: true } });
  if (!inviter.emailVerified) {
    throw new AppError(
      "Confirm your own email before inviting people who aren't on BillSplit yet. Use the link we sent you, or resend it from Account.",
      "FORBIDDEN",
    );
  }
  if (!name) {
    throw new AppError("Nobody has signed up with that email yet. Add their name and we'll invite them.", "VALIDATION", {
      name: "Add their name so everyone knows who this is.",
    });
  }
  const { count } = await hit(`invite:user:${inviterId}`, 24 * 60 * 60 * 1000);
  if (count > PLACEHOLDERS_PER_USER_PER_DAY) {
    throw new AppError(
      `You've invited ${PLACEHOLDERS_PER_USER_PER_DAY} new people today. Try again tomorrow, or share the group's invite link instead.`,
      "RATE_LIMITED",
    );
  }
  const user = await client.user.create({
    data: { email, name, password: "", status: "placeholder" },
    select: { id: true, name: true, status: true },
  });
  return { user, created: true };
}
