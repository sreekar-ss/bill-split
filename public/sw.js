/*
 * BillSplit service worker: push notifications, plus an offline page for navigations.
 * Plain JS, no build step.
 *
 * Caching is deliberately tiny: only the static /offline page is stored. Signed-in pages, API routes
 * and Server Action responses always go to the network and are never cached.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// --- offline fallback ---------------------------------------------------------------------------

const OFFLINE_CACHE = "bs-offline-v1";
const OFFLINE_URL = "/offline";

/** Used when even the cached offline page is missing (first visit dropped before install finished). */
const OFFLINE_FALLBACK_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>You're offline</title></head>" +
  '<body style="font-family:system-ui,sans-serif;margin:0;padding:40px 16px;background:#f2f5f1;color:#13213f">' +
  '<main style="max-width:400px;margin:0 auto"><h1 style="font-size:1.625rem;margin:0 0 8px">You\'re offline</h1>' +
  '<p style="color:#55627a;margin:0 0 24px">This page needs a connection to load. It will reload by itself once you\'re back online.</p>' +
  '<button type="button" onclick="location.reload()" style="height:48px;padding:0 20px;border:0;border-radius:10px;background:#13213f;color:#fff;font:inherit;font-weight:600">Retry</button>' +
  '</main><script>addEventListener("online",function(){location.reload()})</script></body></html>';

/**
 * Fetch /offline without cookies and store a self-contained copy: stylesheets are inlined (their
 * hashed URLs change every deploy and won't be reachable offline) and external scripts are removed,
 * so the page never tries to hydrate under another URL. Its own inline Retry script stays.
 */
async function cacheOfflinePage() {
  const res = await fetch(OFFLINE_URL, { cache: "no-store", credentials: "omit", redirect: "error" });
  if (!res.ok) return;
  let html = await res.text();

  const links = html.match(/<link\b[^>]*>/g) || [];
  for (const tag of links) {
    const href = /\bhref="([^"]+)"/.exec(tag);
    if (/\brel="stylesheet"/.test(tag) && href) {
      try {
        const cssUrl = new URL(href[1].replace(/&amp;/g, "&"), self.location.origin);
        if (cssUrl.origin !== self.location.origin) continue;
        const cssRes = await fetch(cssUrl, { credentials: "omit" });
        if (!cssRes.ok) continue;
        // Relative url(...) (fonts) would resolve against the page once inlined: make them absolute.
        const css = (await cssRes.text()).replace(/url\((['"]?)(?!data:|https?:|\/)([^'")]+)\1\)/g, (_m, q, path) => {
          return `url(${q}${new URL(path, cssUrl).pathname}${q})`;
        });
        html = html.replace(tag, () => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`);
      } catch {
        /* keep the <link>; the browser may still have it cached */
      }
    } else if (/\brel="(?:modulepreload|preload)"/.test(tag) && /\bas="script"/.test(tag)) {
      html = html.replace(tag, "");
    }
  }
  html = html.replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, "");

  const cache = await caches.open(OFFLINE_CACHE);
  await cache.put(OFFLINE_URL, new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
}

self.addEventListener("install", (event) => {
  // Best effort: a failed fetch must never stop the worker (and push) from installing.
  event.waitUntil(cacheOfflinePage().catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("bs-offline-") && k !== OFFLINE_CACHE).map((k) => caches.delete(k)));
      if (!(await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE }))) await cacheOfflinePage().catch(() => {});
    })(),
  );
});

// Page navigations only, network first. Nothing fetched here is ever written to the cache.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  const url = new URL(req.url);
  // Downloads (CSV export) and other API routes go straight to the browser, untouched.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(req).catch(async () => {
      const cached = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE });
      return (
        cached ||
        new Response(OFFLINE_FALLBACK_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })
      );
    }),
  );
});

/** Only ever open pages of this app (a push payload can't send people elsewhere). */
function safePath(url) {
  try {
    const u = new URL(url || "/home", self.location.origin);
    return u.origin === self.location.origin ? u.pathname + u.search + u.hash : "/home";
  } catch {
    return "/home";
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 120) : "BillSplit";
  const options = {
    body: typeof data.body === "string" ? data.body.slice(0, 240) : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: typeof data.tag === "string" ? data.tag.slice(0, 80) : undefined,
    data: { url: safePath(data.url) },
  };
  // iOS and Chrome require every push to show a notification (userVisibleOnly). Open BillSplit tabs
  // are told it arrived, so "Send a test notification" can tell "arrived but hidden by the OS" apart
  // from "never arrived".
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: "push-received", tag: options.tag });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              /* cross-origin or detached: fall through to openWindow */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
