/** Small copy helpers shared by the group screens (pure, safe on server and client). */
import { personName, type PersonStatus } from "@/lib/utils/person";

export { personName };

/** Anyone shown by name in the group screens. `status` marks invited placeholders and deleted accounts. */
export type NamedPerson = { id: string; name: string; status?: PersonStatus | null };

/** "Ana", "Ana and Ben", "Ana, Ben and Chloe", "Ana, Ben, Chloe and 3 others". */
export function listNames(names: string[], total: number = names.length): string {
  const shown = total > 4 ? names.slice(0, 3) : names.slice(0, total);
  const extra = total - shown.length;
  if (extra > 0) return `${shown.join(", ")} and ${extra} ${extra === 1 ? "other" : "others"}`;
  if (shown.length <= 1) return shown[0] ?? "";
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/** The name to draw initials from: never "Ben (invited)" (that would read "B("). */
export function avatarName(person: NamedPerson): string {
  return person.status === "deleted" ? "Deleted user" : person.name;
}

export function memberCount(n: number): string {
  return n === 1 ? "1 member" : `${n} members`;
}

/** "Chloe pays you", "You pay Ben", "Dev pays Ben". */
export function paysSentence(from: NamedPerson, to: NamedPerson, meId: string): string {
  const verb = from.id === meId ? "pay" : "pays";
  return `${personName(from, meId, true)} ${verb} ${personName(to, meId)}`;
}

/** "Chloe paid you", "You paid Ben". */
export function paidSentence(from: NamedPerson, to: NamedPerson, meId: string): string {
  return `${personName(from, meId, true)} paid ${personName(to, meId)}`;
}
