import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";

/**
 * A group's avatar: its emoji on a quiet round tile, or the name's initials (the person avatar)
 * when it has none. Decorative: the group's name is always next to it.
 */
export function GroupAvatar({
  id,
  name,
  icon,
  size = 40,
  className,
}: {
  id: string;
  name: string;
  icon?: string | null;
  size?: number;
  className?: string;
}) {
  if (!icon) return <Avatar id={id} name={name} size={size} className={className} />;
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full border border-rule bg-surface leading-none", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.52) }}
    >
      {icon}
    </span>
  );
}
