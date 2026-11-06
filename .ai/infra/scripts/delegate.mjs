#!/usr/bin/env node
/**
 * Multi-agent delegation claims.
 *
 * A claim is a short-lived, machine-local record of which files a task owns. It
 * exists to stop two agents from editing the same file in parallel without a
 * decision. The contract behind it is in `.ai/infra/delegation-protocol.md`.
 *
 *   node .ai/infra/scripts/delegate.mjs claim --task feat-x --agent lead --files "features/x/**,lib/db/dexie.ts"
 *   node .ai/infra/scripts/delegate.mjs check --files "features/x/components/a.tsx"
 *   node .ai/infra/scripts/delegate.mjs status
 *   node .ai/infra/scripts/delegate.mjs release --task feat-x
 *
 * Overlap is conservative: if two globs *could* touch the same path, the claim
 * is refused. `--takeover --reason "..."` is the explicit coordination path and
 * records who decided and why.
 *
 * State lives in `.ai/infra/delegation/claims.json` (gitignored). Exit 0 = ok,
 * 1 = overlap / unknown task, 2 = bad arguments.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ROOT,
  globsOverlap,
  isMain,
  parseArgs,
  readJson,
} from "./lib.mjs";
import { parseRuntimeEnv } from "../../../lib/config/runtime-env.mjs";

const runtimeEnv = parseRuntimeEnv();
const STATE = runtimeEnv.VIATIK_DELEGATION_FILE
  ? path.resolve(runtimeEnv.VIATIK_DELEGATION_FILE)
  : path.join(ROOT, ".ai/infra/delegation/claims.json");

const DEFAULT_TTL_HOURS = 8;

function load() {
  const state = existsSync(STATE) ? readJson(STATE) : null;
  return state?.claims ? state : { version: 1, claims: [] };
}

function save(state) {
  mkdirSync(path.dirname(STATE), { recursive: true });
  writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function active(state) {
  const now = Date.now();
  return state.claims.filter((claim) => !claim.expiresAt || Date.parse(claim.expiresAt) > now);
}

function overlaps(claim, files) {
  return files.some((file) => claim.files.some((owned) => globsOverlap(owned, file)));
}

function describe(claim) {
  return `${claim.task} (${claim.agent}) — ${claim.files.join(", ")} until ${claim.expiresAt}`;
}

function claim(flags) {
  const task = flags.task;
  const files = String(flags.files ?? "")
    .split(",")
    .map((file) => file.trim())
    .filter(Boolean);
  if (!task || files.length === 0) {
    process.stderr.write("claim needs --task <id> and --files <glob,glob>\n");
    return 2;
  }
  const state = load();
  const conflicts = active(state).filter((existing) => existing.task !== task && overlaps(existing, files));
  if (conflicts.length > 0 && !flags.takeover) {
    process.stderr.write("✖ delegation overlap — these files are already claimed:\n");
    for (const conflict of conflicts) process.stderr.write(`    ${describe(conflict)}\n`);
    process.stderr.write(
      "  Coordinate with the owning agent, then re-run with --takeover --reason \"<decision>\".\n"
    );
    return 1;
  }
  if (conflicts.length > 0 && !flags.reason) {
    process.stderr.write("✖ --takeover requires --reason so the decision is recorded\n");
    return 2;
  }

  const ttl = Number(flags.ttl ?? DEFAULT_TTL_HOURS);
  const record = {
    task,
    agent: flags.agent ?? "unknown",
    files,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttl * 3_600_000).toISOString(),
    ...(flags.takeover ? { takeover: true, reason: flags.reason, overrode: conflicts.map((item) => item.task) } : {}),
  };
  state.claims = [...state.claims.filter((existing) => existing.task !== task), record];
  save(state);
  process.stdout.write(`✔ claimed ${files.length} path(s) for ${task} until ${record.expiresAt}\n`);
  return 0;
}

function check(flags) {
  const files = String(flags.files ?? "")
    .split(",")
    .map((file) => file.trim())
    .filter(Boolean);
  if (files.length === 0) {
    process.stderr.write("check needs --files <glob,glob>\n");
    return 2;
  }
  const state = load();
  const conflicts = active(state).filter((existing) => overlaps(existing, files));
  if (conflicts.length === 0) {
    process.stdout.write("✔ no active claim overlaps these paths\n");
    return 0;
  }
  process.stderr.write("✖ active claims overlap these paths:\n");
  for (const conflict of conflicts) process.stderr.write(`    ${describe(conflict)}\n`);
  return 1;
}

function status() {
  const state = load();
  const live = active(state);
  if (live.length === 0) {
    process.stdout.write("· no active delegation claims\n");
    return 0;
  }
  process.stdout.write(`· ${live.length} active delegation claim(s)\n`);
  for (const item of live) {
    process.stdout.write(`  ${describe(item)}\n`);
    if (item.takeover) process.stdout.write(`    takeover of ${item.overrode?.join(", ")}: ${item.reason}\n`);
  }
  return 0;
}

function release(flags) {
  if (!flags.task) {
    process.stderr.write("release needs --task <id>\n");
    return 2;
  }
  const state = load();
  const before = state.claims.length;
  state.claims = state.claims.filter((item) => item.task !== flags.task);
  save(state);
  if (state.claims.length === before) {
    process.stderr.write(`! no claim for task "${flags.task}"\n`);
    return 1;
  }
  process.stdout.write(`✔ released ${flags.task}\n`);
  return 0;
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2), { booleans: ["takeover", "help"] });
  const command = positional[0];
  if (flags.help || !command) {
    process.stdout.write(
      "Usage: node .ai/infra/scripts/delegate.mjs <claim|check|status|release> [--task id] [--agent name] [--files globs] [--ttl hours] [--takeover --reason text]\n"
    );
    return;
  }
  const commands = { claim, check, status, release };
  const handler = commands[command];
  if (!handler) {
    process.stderr.write(`unknown command: ${command} (try --help)\n`);
    process.exitCode = 2;
    return;
  }
  process.exitCode = handler(flags);
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`✖ delegation tool failed: ${error?.stack ?? error}\n`);
    process.exit(2);
  }
}
