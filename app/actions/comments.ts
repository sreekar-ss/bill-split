"use server";

import { after } from "next/server";
import { addComment, deleteComment, notifyCommentAdded } from "@/lib/server/comments";
import { authed } from "./run";

export async function addCommentAction(expenseId: string, input: { text: string }) {
  return authed(async (user) => {
    const c = await addComment(user.id, expenseId, input);
    after(() => notifyCommentAdded(c.id));
    return { id: c.id };
  });
}

export async function deleteCommentAction(commentId: string) {
  return authed((user) => deleteComment(user.id, commentId));
}
