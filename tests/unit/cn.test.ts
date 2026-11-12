import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cn, FONT_SIZE_TOKENS } from "@/lib/utils/cn";

describe("cn", () => {
  it("keeps a colour next to a theme font size", () => {
    expect(cn("num text-owe hero-figure text-hero")).toBe("num text-owe hero-figure text-hero");
    expect(cn("shrink-0 text-body-sm text-owed")).toBe("shrink-0 text-body-sm text-owed");
    expect(cn("h-9 px-3 text-body-sm", "text-owe")).toBe("h-9 px-3 text-body-sm text-owe");
  });

  it("still resolves real conflicts", () => {
    expect(cn("text-meta", "text-body-sm")).toBe("text-body-sm");
    expect(cn("text-ink", "text-owe")).toBe("text-owe");
    expect(cn("text-[1rem]", "text-title")).toBe("text-title");
  });

  it("knows every --text-* size defined in the theme", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    const defined = [...css.matchAll(/--text-([a-z-]+):/g)].map((m) => m[1]);
    expect([...defined].sort()).toEqual([...FONT_SIZE_TOKENS].sort());
  });
});
