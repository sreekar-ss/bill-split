import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  poweredByHeader: false,
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
