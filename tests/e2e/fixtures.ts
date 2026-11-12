import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

let seq = 0;

/**
 * Every test gets its own client IP (sent as X-Forwarded-For, which `next start` keeps when the
 * client supplies it, the way Vercel's edge sets it in production). Sign-up and login are throttled
 * per IP, so without this the whole suite would share one budget and later tests would be blocked
 * by earlier ones. Contexts opened with `browser.newContext()` inside a test inherit it too.
 */
export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, provide, info) => {
    seq += 1;
    // 10.x.y.z, unique per test run in this worker (plus a per-process salt for parallel runs).
    const n = (process.pid % 200) * 65_536 + ((info.workerIndex * 9973 + seq) % 65_536);
    const ip = `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
    await provide({ ...extraHTTPHeaders, "x-forwarded-for": ip });
  },
});

