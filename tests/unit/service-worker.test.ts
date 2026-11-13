import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

/** Loads public/sw.js into a sandbox with a fake `self`, and returns its event handlers. */
function loadServiceWorker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const windowClient = { focus: vi.fn(async () => {}), navigate: vi.fn(async () => {}) };
  let windows: unknown[] = [];
  const self = {
    location: { origin: "https://billsplit.example" },
    addEventListener: (type: string, fn: (event: unknown) => void) => (handlers[type] = fn),
    skipWaiting: () => {},
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }) },
    clients: { claim: async () => {}, matchAll: async () => windows, openWindow: async (url: string) => void opened.push(url) },
  };
  runInNewContext(readFileSync(resolve("public/sw.js"), "utf8"), { self, URL });
  const fire = async (type: string, event: Record<string, unknown>) => {
    let done: Promise<unknown> = Promise.resolve();
    handlers[type]({ ...event, waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  return { fire, shown, opened, windowClient, setWindows: (w: unknown[]) => (windows = w) };
}

const pushEvent = (data: unknown) => ({ data: { json: () => data, text: () => JSON.stringify(data) } });

describe("service worker", () => {
  it("shows a notification with the payload's title, body and in-app link", async () => {
    const sw = loadServiceWorker();
    await sw.fire("push", pushEvent({ title: "Ana added Dinner", body: "You owe $30.00.", url: "/expenses/e1", tag: "expense-e1" }));
    expect(sw.shown).toEqual([
      { title: "Ana added Dinner", options: expect.objectContaining({ body: "You owe $30.00.", tag: "expense-e1", data: { url: "/expenses/e1" }, icon: "/icons/icon-192.png" }) },
    ]);
  });

  it("never links outside the app and survives junk payloads", async () => {
    const sw = loadServiceWorker();
    await sw.fire("push", pushEvent({ title: "Hi", url: "https://evil.example/steal" }));
    await sw.fire("push", { data: { json: () => { throw new Error("not json"); }, text: () => "plain text" } });
    await sw.fire("push", { data: null });
    expect(sw.shown.map((n) => [n.title, n.options.data])).toEqual([
      ["Hi", { url: "/home" }],
      ["BillSplit", { url: "/home" }],
      ["BillSplit", { url: "/home" }],
    ]);
    expect(sw.shown[1].options.body).toBe("plain text");
  });

  it("opens the linked page on tap, reusing an open window", async () => {
    const sw = loadServiceWorker();
    const notification = { close: vi.fn(), data: { url: "/groups/g1" } };
    await sw.fire("notificationclick", { notification });
    expect(notification.close).toHaveBeenCalled();
    expect(sw.opened).toEqual(["/groups/g1"]);

    sw.setWindows([sw.windowClient]);
    await sw.fire("notificationclick", { notification });
    expect(sw.windowClient.focus).toHaveBeenCalled();
    expect(sw.windowClient.navigate).toHaveBeenCalledWith("/groups/g1");
  });
});
