/** Small copy helpers shared by the group screens (pure, safe on server and client). */

/** "Ana", "Ana and Ben", "Ana, Ben and Chloe", "Ana, Ben, Chloe and 3 others". */
export function listNames(names: string[], total: number = names.length): string {
  const shown = total > 4 ? names.slice(0, 3) : names.slice(0, total);
  const extra = total - shown.length;
  if (extra > 0) return `${shown.join(", ")} and ${extra} ${extra === 1 ? "other" : "others"}`;
  if (shown.length <= 1) return shown[0] ?? "";
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

export function memberCount(n: number): string {
  return n === 1 ? "1 member" : `${n} members`;
}

/** The viewer is "You" at the start of a sentence and "you" elsewhere. */
export function personName(person: { id: string; name: string }, meId: string, start = false): string {
  if (person.id !== meId) return person.name;
  return start ? "You" : "you";
}

/** "Chloe pays you", "You pay Ben", "Dev pays Ben". */
export function paysSentence(from: { id: string; name: string }, to: { id: string; name: string }, meId: string): string {
  const verb = from.id === meId ? "pay" : "pays";
  return `${personName(from, meId, true)} ${verb} ${personName(to, meId)}`;
}

/** "Chloe paid you", "You paid Ben". */
export function paidSentence(from: { id: string; name: string }, to: { id: string; name: string }, meId: string): string {
  return `${personName(from, meId, true)} paid ${personName(to, meId)}`;
}

export function monthLabel(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(date));
}
