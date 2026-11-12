#!/usr/bin/env node
/**
 * BillSplit delivery pipeline — the single gate every change must pass.
 *
 *   npm run pipeline                 # all stages
 *   npm run pipeline -- --only=unit,integration
 *   npm run pipeline -- --skip=e2e
 *   npm run pipeline -- --from=build
 *
 * Stages run in order and stop at the first failure. A machine-readable summary is written to
 * reports/pipeline.json so agents (and CI) can see exactly which gate failed and why.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { TEST_SESSION_SECRET, testDatabaseUrl } from "./test-env.mjs";

const testEnv = {
  DATABASE_URL: testDatabaseUrl(), // throws unless the host is localhost
  SESSION_SECRET: TEST_SESSION_SECRET,
};

const STAGES = [
  { name: "env-safety", desc: "test DB is local; prod env not used", run: async () => ({ code: 0, out: `test db: ${new URL(testEnv.DATABASE_URL).host}${new URL(testEnv.DATABASE_URL).pathname}` }) },
  { name: "generate", desc: "prisma generate", cmd: "npx prisma generate" },
  { name: "typecheck", desc: "tsc --noEmit", cmd: "npx tsc --noEmit -p tsconfig.json" },
  { name: "lint", desc: "eslint", cmd: "npx eslint . --max-warnings=0" },
  { name: "unit", desc: "vitest unit (domain math)", cmd: "npx vitest run --project unit" },
  { name: "integration", desc: "vitest integration (services × Postgres)", cmd: "npx vitest run --project integration" },
  { name: "build", desc: "next build", cmd: "npx next build", env: testEnv },
  { name: "e2e", desc: "playwright (desktop + mobile)", cmd: "npx playwright test" },
];

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = "true"] = a.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const only = args.only?.split(",");
const skip = args.skip?.split(",") ?? [];
const fromIdx = args.from ? STAGES.findIndex((s) => s.name === args.from) : 0;

const selected = STAGES.filter((s, i) => i >= Math.max(0, fromIdx) && (!only || only.includes(s.name)) && !skip.includes(s.name));

function sh(cmd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, { shell: true, env: { ...process.env, ...env, FORCE_COLOR: "0" } });
    let out = "";
    const onData = (d) => {
      out += d;
      if (args.verbose) process.stdout.write(d);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code) => resolve({ code, out }));
  });
}

const results = [];
let failed = false;
console.log(`\nBillSplit pipeline — ${selected.map((s) => s.name).join(" → ")}\n`);
for (const stage of selected) {
  const t0 = performance.now();
  process.stdout.write(`▸ ${stage.name.padEnd(12)} ${stage.desc} … `);
  const { code, out } = stage.run ? await stage.run() : await sh(stage.cmd, stage.env);
  const ms = Math.round(performance.now() - t0);
  const ok = code === 0;
  console.log(ok ? `ok (${(ms / 1000).toFixed(1)}s)` : `FAILED (${(ms / 1000).toFixed(1)}s)`);
  const tail = out.trim().split("\n").slice(-60).join("\n");
  results.push({ stage: stage.name, ok, ms, ...(ok ? {} : { output: tail }) });
  if (!ok) {
    console.log(`\n${tail}\n`);
    failed = true;
    break;
  }
}

mkdirSync("reports", { recursive: true });
writeFileSync("reports/pipeline.json", JSON.stringify({ ok: !failed, results }, null, 2));
console.log(failed ? "\n✗ pipeline failed — see reports/pipeline.json\n" : "\n✓ pipeline passed\n");
process.exit(failed ? 1 : 0);
