"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addCommentAction, deleteCommentAction } from "@/app/actions/comments";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormError, Label, Textarea } from "@/components/ui/field";
import { runAction } from "@/lib/client/run-action";
import type { CommentItem } from "@/lib/server/comments";
import { cn } from "@/lib/utils/cn";
import { displayName } from "@/lib/utils/person";
import { CommentTime } from "./comment-time";

export const COMMENT_MAX = 500;
/** The character counter appears once this few characters are left. */
const COUNTER_FROM = 100;

type ThreadComment = CommentItem & { pending?: boolean };
type OptimisticAdd = { comment: ThreadComment };

/**
 * The comment list and composer on the expense page. Posting appends the comment straight away
 * (marked "Posting…") and the server's list replaces it once the action revalidates the page.
 */
export function CommentThread({
  expenseId,
  comments,
  me,
  archived,
  groupHref,
  headingId,
}: {
  expenseId: string;
  comments: CommentItem[];
  me: { id: string; name: string };
  archived: boolean;
  /** The group page, linked from the archived note (that's where Unarchive is). */
  groupHref?: string;
  /** The section heading, focused after a comment is deleted (its row and button are gone). */
  headingId: string;
}) {
  const [list, addOptimistic] = useOptimistic<ThreadComment[], OptimisticAdd>(comments, (state, { comment }) => [...state, comment]);
  const [, startPosting] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Polite status for screen readers ("Comment posted"); failures use FormError's alert. */
  const [status, setStatus] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const seq = useRef(0);
  const deletedId = useRef<string | null>(null);
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  // Once a deleted comment has left the list and the dialog has closed, move focus to the heading.
  // The timeout runs after the dialog's own focus return (which Radix also defers).
  useEffect(() => {
    const id = deletedId.current;
    if (!id || confirmId || list.some((c) => c.id === id)) return;
    deletedId.current = null;
    window.setTimeout(() => document.getElementById(headingId)?.focus({ preventScroll: true }), 0);
  });

  function post() {
    const value = text.trim();
    if (!value || value.length > COMMENT_MAX) return;
    setError(null);
    setStatus("");
    // Clearing the text disables the submit button, which would drop focus to <body>: keep the
    // keyboard in the composer instead.
    textareaRef.current?.focus();
    setText("");
    seq.current += 1;
    const comment: ThreadComment = {
      id: `pending-${seq.current}`,
      text: value,
      createdAt: new Date(),
      author: { id: me.id, name: me.name, status: "active" },
      mine: true,
      pending: true,
    };
    startPosting(async () => {
      addOptimistic({ comment });
      const result = await runAction(() => addCommentAction(expenseId, { text: value }));
      if (!result.ok) {
        setError(result.error);
        // Put the text back unless they've already started another comment.
        setText((current) => (current.trim() ? current : value));
        return;
      }
      setStatus("Comment posted.");
    });
  }

  function remove() {
    const id = confirmId;
    if (!id) return;
    startDeleting(async () => {
      const result = await runAction(() => deleteCommentAction(id));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      deletedId.current = id;
      setConfirmId(null);
      toast.success("Comment deleted");
    });
  }

  const left = COMMENT_MAX - text.length;
  // Screen readers hear the count only when it crosses a step, not on every keystroke.
  const announcement = left <= 0 ? "Character limit reached." : left <= 20 ? "20 or fewer characters left." : left <= COUNTER_FROM ? `${COUNTER_FROM} or fewer characters left.` : "";

  return (
    <>
      {list.length ? (
        <ul className="border-t border-rule">
          {list.map((c) => (
            <li key={c.id} className="flex gap-3 border-b border-rule py-3">
              <Avatar id={c.author.id} name={c.author.name} size={32} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{c.mine ? "You" : displayName(c.author)}</span>
                  <span className="text-meta text-ink-muted">{c.pending ? "Posting…" : <CommentTime date={c.createdAt} />}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap [overflow-wrap:anywhere]">{c.text}</p>
              </div>
              {c.mine && !c.pending && !archived ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-2 -mt-1.5 text-ink-muted hover:text-owe"
                  aria-label={`Delete your comment: ${snippet(c.text)}`}
                  onClick={() => setConfirmId(c.id)}
                >
                  <Trash2 aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-sm text-ink-muted">
          {archived ? "No comments on this expense." : "No comments yet. Ask a question or add a detail for everyone on this expense."}
        </p>
      )}

      {archived ? (
        <p className="mt-4 rounded-[10px] border border-rule px-3 py-2.5 text-body-sm text-ink-muted">
          This group is archived.{" "}
          {groupHref ? (
            <>
              Unarchive it on the{" "}
              <Link href={groupHref} className="font-medium text-ink underline decoration-rule underline-offset-4 hover:decoration-ink">
                group page
              </Link>{" "}
              to add comments.
            </>
          ) : (
            "Unarchive it to add comments."
          )}
        </p>
      ) : (
        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            post();
          }}
        >
          <Label htmlFor={inputId}>Add a comment</Label>
          <Textarea
            ref={textareaRef}
            id={inputId}
            className="mt-1.5"
            rows={3}
            maxLength={COMMENT_MAX}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
                event.preventDefault();
                post();
              }
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p id={hintId} className="min-w-0 flex-1 text-meta text-ink-muted">
              {left <= COUNTER_FROM ? (
                <span className={cn("num", left <= 20 && "font-semibold text-owe")}>
                  {left <= 0 ? "Character limit reached" : `${left} ${left === 1 ? "character" : "characters"} left`}
                </span>
              ) : (
                <span className="hidden sm:inline">Press Ctrl+Enter or Cmd+Enter to post.</span>
              )}
            </p>
            <span className="sr-only" aria-live="polite">
              {announcement}
            </span>
            <span className="sr-only" role="status">
              {status}
            </span>
            <Button type="submit" className="ml-auto" disabled={!text.trim()}>
              Post comment
            </Button>
          </div>
          {error ? (
            <div id={errorId} className="mt-3">
              <FormError message={error} />
            </div>
          ) : null}
        </form>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(open) => !deleting && !open && setConfirmId(null)}
        title="Delete this comment?"
        body="It will be removed for everyone on this expense. This can't be undone."
        confirmLabel="Delete comment"
        pending={deleting}
        onConfirm={remove}
      />
    </>
  );
}

function snippet(text: string) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 40 ? `${oneLine.slice(0, 39)}…` : oneLine;
}
