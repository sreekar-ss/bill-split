import type { ExpenseInput } from "@/lib/validation";

/**
 * Expenses added while offline, kept on this device (IndexedDB, no dependencies) until they can be
 * sent. Each item carries the clientId the server de-duplicates on, so replaying one that already
 * went through is harmless, and the id of the user who added it, so a different person signing in
 * on the same device never sends it as themselves.
 *
 * Storage only: sending lives in components/pwa/offline-sync.tsx.
 */
export interface QueuedExpense {
  /** Same UUID as `input.clientId`; the store's key. */
  clientId: string;
  userId: string;
  input: ExpenseInput & { clientId: string };
  /** Epoch ms; items are replayed oldest first. */
  queuedAt: number;
  /** How to show it while it waits ("In Flat", in EUR). Optional: older items don't have it. */
  label?: QueuedLabel;
  /**
   * Set when the server refused it (the group was archived, they left it, validation). The item is
   * kept so the person can review and save it elsewhere, or discard it; it isn't retried.
   */
  failed?: { error: string; at: number };
}

export interface QueuedLabel {
  /** "In Flat" or "With Ben". */
  where: string;
  currency: string;
}

const DB_NAME = "billsplit-offline";
const DB_VERSION = 1;
const STORE = "expenses";
const CHANNEL = "bs-offline-queue";

let dbPromise: Promise<IDBDatabase> | null = null;

export function offlineQueueSupported(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!offlineQueueSupported()) return reject(new Error("IndexedDB is not available"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "clientId" });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading the schema: let it, and reopen next time.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("Couldn't open the offline store"));
    req.onblocked = () => reject(new Error("The offline store is blocked by another tab"));
  }).catch((error: unknown) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error ?? new Error("Offline store transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Offline store transaction aborted"));
  });
}

// --- change notifications (this tab and other tabs) --------------------------------------------

const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === "undefined") return channel;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => listeners.forEach((l) => l());
  } catch {
    channel = null;
  }
  return channel;
}

function changed() {
  listeners.forEach((l) => l());
  try {
    getChannel()?.postMessage("changed");
  } catch {
    /* closed channel: other tabs catch up on their next flush */
  }
}

/** Called whenever the queue changes, in this tab or another. Returns an unsubscribe function. */
export function subscribeOfflineQueue(listener: () => void): () => void {
  listeners.add(listener);
  getChannel();
  return () => {
    listeners.delete(listener);
  };
}

// --- operations ---------------------------------------------------------------------------------

/** Queue (or re-queue, clearing any failure) an expense under its clientId. */
export async function enqueueExpense(userId: string, input: ExpenseInput & { clientId: string }, label?: QueuedLabel): Promise<void> {
  const item: QueuedExpense = { clientId: input.clientId, userId, input, queuedAt: Date.now(), ...(label ? { label } : {}) };
  await putQueuedExpense(item);
}

/** Store an item exactly as given (e.g. putting a removed one back for Undo). */
export async function putQueuedExpense(item: QueuedExpense): Promise<void> {
  await run("readwrite", (store) => store.put(item));
  changed();
}

/** Keep an item the server refused, with its reason, so it can be reviewed instead of lost. */
export async function markQueuedExpenseFailed(item: QueuedExpense, error: string): Promise<void> {
  await putQueuedExpense({ ...item, failed: { error, at: Date.now() } });
}

/** Every queued item on this device, oldest first. */
export async function listQueuedExpenses(): Promise<QueuedExpense[]> {
  if (!offlineQueueSupported()) return [];
  const all = (await run<QueuedExpense[]>("readonly", (store) => store.getAll() as IDBRequest<QueuedExpense[]>)) ?? [];
  return all.sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function removeQueuedExpense(clientId: string): Promise<void> {
  await run("readwrite", (store) => store.delete(clientId));
  changed();
}

/** Drop everything queued on this device (on logout, after warning about unsynced items). */
export async function clearOfflineQueue(): Promise<void> {
  if (!offlineQueueSupported()) return;
  await run("readwrite", (store) => store.clear());
  changed();
}

/**
 * A v4 UUID for an expense form. `crypto.randomUUID` only exists in secure contexts (not on a
 * phone testing over plain http on the LAN), so fall back to getRandomValues.
 */
export function newClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
