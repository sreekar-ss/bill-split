/* BillSplit service worker: push notifications (no offline caching yet). Plain JS, no build step. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
  // iOS and Chrome require every push to show a notification (userVisibleOnly).
  event.waitUntil(self.registration.showNotification(title, options));
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
