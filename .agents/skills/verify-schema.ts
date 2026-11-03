#!/usr/bin/env node
/**
 * Dexie schema guardian.
 *
 * Enforces two invariants from AGENTS.md §3 without asking an agent to read
 * `lib/db/dexie.ts` by hand:
 *
 *   1. Migrations are additive. Every `this.version(N)` block that exists in the
 *      baseline commit must be byte-identical (whitespace-normalised) in the
 *      working tree, and new versions must continue the sequence exactly.
 *   2. Outbox writes stay in `lib/sync/`. Nothing under `features/`, `app/`, or
 *      `components/` may write to `outboxMutations`; those writes go through
 *      `append()` inside `TransactionContext.runInTransaction`.
 *
 * Read-only. Never writes, never formats, never touches IndexedDB.
 *
 *   node .agents/skills/verify-schema.ts [--base <git-ref>] [--quiet]
 *
 * Exit 0 = clean, 1 = violation, 2 = could not run the baseline comparison.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCHEMA_FILE = "lib/db/dexie.ts";
const OUTBOX_WRITES = /\.outboxMutations\.(add|put|bulkAdd|bulkPut|update|delete)\(/g;
const OUTBOX_TABLE = /\.table\(\s*["'`]outboxMutations["'`]\s*\)/g;
const WRITE_ROOTS = ["features", "app", "components"];
const SKIP_DIRS = new Set(["node_modules", "__tests__", ".next", ".worktrees", "test-results"]);

type Finding = { file: string; line: number; message: string };
type VersionBlock = { version: number; text: string; line: number };

function parseArgs(argv: string[]): { base: string; quiet: boolean } {
  let base = "HEAD";
  let quiet = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base" && argv[i + 1]) {
      base = argv[i + 1];
      i += 1;
    } else if (arg === "--quiet") {
      quiet = true;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: node .agents/skills/verify-schema.ts [--base <git-ref>] [--quiet]\n"
      );
      process.exit(0);
    }
  }
  return { base, quiet };
}

/** Collapse whitespace so a prettier-only reformat does not look like an edit. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === "\n") line += 1;
  }
  return line;
}

/**
 * Index just past the `)` that closes the parenthesis at `openIndex`, skipping
 * strings and comments so a `)` inside `"a, b"` or a `// …` note cannot unbalance
 * the scan. Returns -1 when the source is truncated.
 */
function matchParen(source: string, openIndex: number): number {
  let depth = 0;
  let state: "code" | "line" | "block" | "single" | "double" | "template" = "code";
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "line";
        i += 1;
      } else if (char === "/" && next === "*") {
        state = "block";
        i += 1;
      } else if (char === "'") state = "single";
      else if (char === '"') state = "double";
      else if (char === "`") state = "template";
      else if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
    } else if (state === "line") {
      if (char === "\n") state = "code";
    } else if (state === "block") {
      if (char === "*" && next === "/") {
        state = "code";
        i += 1;
      }
    } else if (char === "\\") {
      i += 1;
    } else if (
      (state === "single" && char === "'") ||
      (state === "double" && char === '"') ||
      (state === "template" && char === "`")
    ) {
      state = "code";
    }
  }
  return -1;
}

/**
 * A version block is `this.version(N)` plus every chained `.stores(...)` and
 * `.upgrade(...)` that belongs to it. Stopping at the version call's own
 * parenthesis would silently ignore the index and backfill edits that matter
 * most.
 */
function blockEnd(source: string, markerIndex: number): number {
  const openParen = source.indexOf("(", markerIndex);
  if (openParen === -1) return -1;
  let end = matchParen(source, openParen);
  while (end !== -1) {
    const chained = /^\s*\.(?:stores|upgrade)\s*\(/.exec(source.slice(end));
    if (!chained) return end;
    const chainEnd = matchParen(source, end + chained[0].length - 1);
    if (chainEnd === -1) return end;
    end = chainEnd;
  }
  return -1;
}

function extractVersionBlocks(source: string): VersionBlock[] {
  const blocks: VersionBlock[] = [];
  const marker = "this.version(";
  let cursor = source.indexOf(marker);
  while (cursor !== -1) {
    const end = blockEnd(source, cursor);
    if (end === -1) break;
    const versionMatch = /^this\.version\(\s*(\d+)\s*\)/.exec(source.slice(cursor, end));
    if (versionMatch) {
      blocks.push({
        version: Number(versionMatch[1]),
        text: normalize(source.slice(cursor, end)),
        line: lineAt(source, cursor),
      });
    }
    cursor = source.indexOf(marker, end);
  }
  return blocks;
}

function readBaseline(ref: string): string | null {
  try {
    return execFileSync("git", ["show", `${ref}:${SCHEMA_FILE}`], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function checkAdditive(baseline: VersionBlock[], current: VersionBlock[]): Finding[] {
  const findings: Finding[] = [];
  const currentByVersion = new Map(current.map((block) => [block.version, block]));

  for (const block of baseline) {
    const now = currentByVersion.get(block.version);
    if (!now) {
      findings.push({
        file: SCHEMA_FILE,
        line: block.line,
        message: `version ${block.version} was deleted. Shipped migrations stay in the file forever — add a new version instead.`,
      });
    } else if (now.text !== block.text) {
      findings.push({
        file: SCHEMA_FILE,
        line: now.line,
        message: `version ${block.version} was modified. Shipped version blocks are immutable — revert this edit and add \`this.version(${Math.max(...baseline.map((b) => b.version)) + 1})\` with a backfill.`,
      });
    }
  }

  const baselineMax = baseline.reduce((max, block) => Math.max(max, block.version), 0);
  const highest = current.reduce((max, block) => Math.max(max, block.version), 0);
  const expected = baselineMax + 1;
  const added = current.filter((block) => block.version > baselineMax).map((block) => block.version);

  if (added.length > 0 && Math.min(...added) !== expected) {
    findings.push({
      file: SCHEMA_FILE,
      line: currentByVersion.get(Math.min(...added))?.line ?? 1,
      message: `new versions must continue from ${expected} (first new version found: ${Math.min(...added)}). Dexie rejects gaps.`,
    });
  }
  if (added.length > 0 && new Set(added).size !== added.length) {
    findings.push({
      file: SCHEMA_FILE,
      line: 1,
      message: "duplicate version numbers found; each `this.version(N)` must be unique.",
    });
  }
  for (let i = 1; i < current.length; i += 1) {
    if (current[i].version <= current[i - 1].version) {
      findings.push({
        file: SCHEMA_FILE,
        line: current[i].line,
        message: `version ${current[i].version} is declared after version ${current[i - 1].version}; keep versions in ascending order.`,
      });
    }
  }

  if (added.length > 0) {
    const nextVersion = highest + 1;
    process.stdout.write(
      `· additive migration detected: v${added.join(", v")} (next free version: v${nextVersion})\n`
    );
    process.stdout.write(
      `· remember: Supabase migration + RLS + mappers + SYNC_TABLE_DEFINITIONS for synced tables\n`
    );
  }
  return findings;
}

function walk(dir: string, acc: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

function checkOutboxWrites(): Finding[] {
  const findings: Finding[] = [];
  const files = WRITE_ROOTS.flatMap((root) => walk(path.join(ROOT, root), []));
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const pattern of [OUTBOX_WRITES, OUTBOX_TABLE]) {
      pattern.lastIndex = 0;
      let match = pattern.exec(source);
      while (match) {
        findings.push({
          file: path.relative(ROOT, file),
          line: lineAt(source, match.index),
          message: `writes to outboxMutations outside lib/sync/. Use \`append()\` from lib/sync/outbox-transactional inside TransactionContext.runInTransaction.`,
        });
        match = pattern.exec(source);
      }
    }
  }
  return findings;
}

/** Files under `features/` that call `append(` — a health signal, not a gate. */
function countAppendSites(): number {
  try {
    return execFileSync("git", ["grep", "-l", "append(", "--", "features"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split("\n")
      .filter(Boolean).length;
  } catch {
    return 0;
  }
}

function main(): void {
  const { base, quiet } = parseArgs(process.argv.slice(2));
  const report = (line: string) => {
    if (!quiet) process.stdout.write(`${line}\n`);
  };

  const currentSource = readFileSync(path.join(ROOT, SCHEMA_FILE), "utf8");
  const currentBlocks = extractVersionBlocks(currentSource);
  if (currentBlocks.length === 0) {
    process.stderr.write(`✖ no \`this.version(N)\` blocks found in ${SCHEMA_FILE}\n`);
    process.exit(2);
  }

  const baselineSource = readBaseline(base);
  if (baselineSource === null) {
    process.stderr.write(
      `⚠ could not read ${SCHEMA_FILE} at ${base} (no git, shallow clone, or untracked file).\n` +
        "  Additive-migration comparison skipped; running the outbox check only.\n"
    );
  }

  const findings: Finding[] = [];
  if (baselineSource !== null) {
    findings.push(...checkAdditive(extractVersionBlocks(baselineSource), currentBlocks));
  }
  findings.push(...checkOutboxWrites());

  const appendSites = countAppendSites();

  report(`· ${SCHEMA_FILE}: ${currentBlocks.length} versions, latest v${currentBlocks.at(-1)?.version}`);
  report(`· append() call sites in features/: ${appendSites} files`);

  if (findings.length === 0) {
    report("✔ schema guardian: additive migrations and outbox writes are clean");
    process.exit(0);
  }

  process.stderr.write(`\n✖ schema guardian found ${findings.length} violation(s):\n`);
  for (const finding of findings) {
    process.stderr.write(`  ${finding.file}:${finding.line} — ${finding.message}\n`);
  }
  process.exit(1);
}

main();
