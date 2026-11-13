"use client";

// CONTRACT (owned by the account/notifications feature; used on group and friend pages). Keep props stable.
export interface RemindButtonProps {
  /** The person who owes the current user. */
  toUserId: string;
  toName: string;
  /** Exactly one: the group the debt is in, or (direct balance) friendId === toUserId. */
  groupId?: string;
  friendId?: string;
  className?: string;
}

export function RemindButton({ toName }: RemindButtonProps) {
  return <button type="button">Remind {toName}</button>;
}
