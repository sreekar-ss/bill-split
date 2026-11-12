/** Consistent labels for people across the app (v2: invited placeholders, deleted accounts). */
export type PersonStatus = "active" | "placeholder" | "deleted" | string;

export function isInvited(p: { status?: PersonStatus | null }): boolean {
  return p.status === "placeholder";
}

/** "Ben (invited)" for placeholders, "Deleted user" for deleted accounts, else the name. */
export function displayName(p: { name: string; status?: PersonStatus | null }): string {
  if (p.status === "deleted") return "Deleted user";
  if (p.status === "placeholder") return `${p.name} (invited)`;
  return p.name;
}
