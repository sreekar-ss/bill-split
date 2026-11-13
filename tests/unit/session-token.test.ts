import { beforeAll, describe, expect, it } from "vitest";
import { SESSION_REFRESH_AFTER_SECONDS, shouldRefreshSession, signSessionToken, verifySessionToken } from "@/lib/auth/token";

beforeAll(() => {
  process.env.SESSION_SECRET = "unit-test-session-secret-0123456789-abcdefghijklmnop";
});

describe("rolling sessions", () => {
  it("round-trips a token with its issue time", async () => {
    const token = await signSessionToken({ userId: "u1", v: 3 });
    const s = await verifySessionToken(token);
    expect(s).toMatchObject({ userId: "u1", v: 3 });
    expect(Math.abs(s!.issuedAt! - Date.now() / 1000)).toBeLessThan(5);
    expect(await verifySessionToken(`${token}x`)).toBeNull();
  });

  it("refreshes only sessions older than a day", () => {
    const now = 1_800_000_000;
    expect(shouldRefreshSession({ userId: "u", v: 0, issuedAt: now - 60 }, now)).toBe(false);
    expect(shouldRefreshSession({ userId: "u", v: 0, issuedAt: now - SESSION_REFRESH_AFTER_SECONDS - 1 }, now)).toBe(true);
    expect(shouldRefreshSession({ userId: "u", v: 0 }, now)).toBe(true);
  });
});
