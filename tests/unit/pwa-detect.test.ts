import { describe, expect, it } from "vitest";
import { detectPlatform, shouldAutoPrompt } from "@/lib/pwa/detect";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 357.0.0",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
};

describe("detectPlatform", () => {
  it("tells the platforms apart", () => {
    expect(detectPlatform(UA.iphoneSafari)).toBe("ios-safari");
    expect(detectPlatform(UA.iphoneChrome)).toBe("ios-other");
    expect(detectPlatform(UA.iphoneInstagram)).toBe("ios-inapp");
    expect(detectPlatform(UA.ipad, 5)).toBe("ios-safari"); // iPadOS pretends to be a Mac
    expect(detectPlatform(UA.ipad, 0)).toBe("desktop");
    expect(detectPlatform(UA.android)).toBe("android");
    expect(detectPlatform(UA.mac)).toBe("desktop");
  });
});

describe("shouldAutoPrompt", () => {
  const base = { platform: "ios-safari" as const, standalone: false, engaged: true, dismissedAt: null, shownThisSession: false, now: Date.UTC(2026, 10, 13) };
  it("prompts engaged phone users who haven't installed", () => {
    expect(shouldAutoPrompt(base)).toBe(true);
    expect(shouldAutoPrompt({ ...base, platform: "android", canInstallNatively: true })).toBe(true);
  });
  it("stays quiet otherwise", () => {
    expect(shouldAutoPrompt({ ...base, standalone: true })).toBe(false);
    expect(shouldAutoPrompt({ ...base, engaged: false })).toBe(false);
    expect(shouldAutoPrompt({ ...base, shownThisSession: true })).toBe(false);
    expect(shouldAutoPrompt({ ...base, platform: "desktop" })).toBe(false);
    expect(shouldAutoPrompt({ ...base, platform: "ios-inapp" })).toBe(false);
    expect(shouldAutoPrompt({ ...base, platform: "android" })).toBe(false); // Chrome hasn't offered install
  });
  it("respects 'Not now' for 30 days", () => {
    const day = 86400000;
    expect(shouldAutoPrompt({ ...base, dismissedAt: base.now - 29 * day })).toBe(false);
    expect(shouldAutoPrompt({ ...base, dismissedAt: base.now - 31 * day })).toBe(true);
  });
});
