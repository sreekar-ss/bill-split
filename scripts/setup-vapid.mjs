#!/usr/bin/env node
/**
 * One-time setup for push notifications: generates a VAPID key pair per environment and stores it in
 * Vercel (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY). Keys are piped straight into `vercel env add` — never
 * printed, never written to disk, no trailing newline. Run from billsplit-next: `node scripts/setup-vapid.mjs`.
 *
 * Changing keys later invalidates existing push subscriptions (devices would need to turn push on again).
 */
import { execFileSync } from "node:child_process";
import webpush from "web-push";

function add(name, env, value, sensitive) {
  const args = ["env", "add", name, env, ...(sensitive ? ["--sensitive"] : []), "--yes", "--non-interactive"];
  execFileSync("vercel", args, { input: value, stdio: ["pipe", "inherit", "inherit"] });
}

for (const env of ["production", "preview"]) {
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  add("VAPID_PUBLIC_KEY", env, publicKey, false);
  add("VAPID_PRIVATE_KEY", env, privateKey, env === "production");
  console.log(`✓ push keys stored for ${env}`);
}
