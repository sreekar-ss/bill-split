import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  poweredByHeader: false,
  experimental: {
    // Keep pages you've just visited for 30s, so going back to a tab is instant instead of a new
    // server round trip (the default is 0). Every successful save clears this cache (see authed()
    // in app/actions/run.ts), so your own changes always show straight away.
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [
      {
        // The service worker must always be re-checked so updates reach installed apps.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
