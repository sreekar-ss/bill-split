import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The theme's type scale (app/globals.css `--text-*`). Without this, tailwind-merge can't tell
 * `text-meta` (a size) from `text-owe` (a colour) and drops one of them.
 */
export const FONT_SIZE_TOKENS = ["meta", "body-sm", "title", "heading", "hero"] as const;

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: [...FONT_SIZE_TOKENS] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
