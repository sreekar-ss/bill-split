import { cn } from "@/lib/utils/cn";

// Muted, ink-friendly tints; picked deterministically from the user id.
const TINTS = ["#DCE6F5", "#DDEEE5", "#F3E3D9", "#E8E0F2", "#F5ECC8", "#DDE9EC"];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ id, name, size = 36, className }: { id: string; name: string; size?: number; className?: string }) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-bold text-[#13213f]", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: TINTS[h % TINTS.length] }}
    >
      {initials(name)}
    </span>
  );
}
