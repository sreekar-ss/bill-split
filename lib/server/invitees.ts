import "server-only";
import { inviteByEmailSchema } from "@/lib/validation";
import { db, type Tx } from "./db";
import { AppError } from "./errors";
import { parse } from "./parse";

/**
 * Find the person behind an email, or — when nobody has signed up with it — create a
 * placeholder account they can claim later via the emailed invite link.
 * A name is required for new placeholders so the group knows who they are.
 */
export async function findOrCreateInvitee(client: Tx | typeof db, input: unknown) {
  const { email, name } = parse(inviteByEmailSchema, input);
  const existing = await client.user.findUnique({ where: { email }, select: { id: true, name: true, status: true } });
  if (existing) {
    if (existing.status === "deleted") throw new AppError("That account was deleted.", "NOT_FOUND", { email: "That account was deleted." });
    return { user: existing, created: false };
  }
  if (!name) {
    throw new AppError("Nobody has signed up with that email yet. Add their name and we'll invite them.", "VALIDATION", {
      name: "Add their name so everyone knows who this is.",
    });
  }
  const user = await client.user.create({
    data: { email, name, password: "", status: "placeholder" },
    select: { id: true, name: true, status: true },
  });
  return { user, created: true };
}
