#!/usr/bin/env node
/**
 * PR quality checklist — evidence collector, not a second reviewer.
 *
 * The `code-review` skill remains the reviewer. This script gathers the facts a
 * reviewer needs before reading the diff: scope, tests, i18n, memory, spec,
 * security surface, schema surface, and the commands that must have run.
 *
 *   node .ai/infra/scripts/review-checklist.mjs [--base main]
 *   node .ai/infra/scripts/review-checklist.mjs --base HEAD --json
 *   node .ai/infra/scripts/review-checklist.mjs --strict   # WARN/REVIEW fail
 *
 * Advisory by default: exit 0. `--strict` exits 1 when a required item is
 * missing. Verification results cannot be inferred from a diff — the checklist
 * prints the commands and marks them UNKNOWN instead of pretending.
 */
import path from "node:path";
import { changedFiles, exists, isMain, listFiles, parseArgs } from "./lib.mjs";

const AREAS = [
  { name: "app", match: /^app\// },
  { name: "components", match: /^components\// },
  { name: "features", match: /^features\// },
  { name: "lib", match: /^lib\// },
  { name: "supabase", match: /^supabase\// },
  { name: "tests", match: /\.(test|spec)\.(ts|tsx|mjs)$/ },
  { name: "agent-infra", match: /^(\.ai|\.agents|memory)\/|^(AGENTS|CLAUDE)\.md$|^(mcp|skills-lock)\.json$/ },
  { name: "config", match: /^(package\.json|pnpm-lock\.yaml|tsconfig\.json|next\.config\.ts|eslint\.config\.mjs|vitest\.config\.mjs)$/ },
];

const SECURITY_SURFACE = /^(supabase\/|lib\/(auth|supabase|security)\/|app\/actions\/|proxy\.ts$)/;
const SCHEMA_SURFACE = /^(lib\/(db|sync)\/|features\/[^/]+\/data\/|lib\/supabase\/mappers\.ts$)/;
const UI_SURFACE = /\.tsx$/;

function areaOf(file) {
  return AREAS.find((area) => area.match.test(file))?.name ?? "other";
}

function featureArea(file) {
  const match = /^features\/([^/]+)\//.exec(file);
  return match?.[1] ?? null;
}

function specFor(area) {
  if (!exists(".ai/specs")) return null;
  return (
    listFiles(".ai/specs", { extensions: [".md"] }).find((spec) =>
      path.posix.basename(spec, ".md").includes(area)
    ) ?? null
  );
}

export function buildChecklist(files) {
  const items = [];
  const add = (status, item, detail) => items.push({ status, item, detail });

  const byArea = {};
  for (const file of files) byArea[areaOf(file)] = (byArea[areaOf(file)] ?? 0) + 1;
  add("INFO", "scope", `${files.length} file(s): ${Object.entries(byArea).map(([key, count]) => `${key}=${count}`).join(", ") || "none"}`);

  const codeChanged = files.some((file) => !/\.(md|json|ya?ml)$/.test(file) && !/\.(test|spec)\./.test(file));
  const testsChanged = files.some((file) => /\.(test|spec)\.(ts|tsx|mjs)$/.test(file));
  if (codeChanged && !testsChanged) {
    add("WARN", "tests", "code changed without a test change — confirm a regression test exists or explain why none is needed");
  } else {
    add("PASS", "tests", testsChanged ? "test files changed alongside the code" : "no code change");
  }

  if (files.some((file) => UI_SURFACE.test(file)) && !files.includes("lib/i18n/frontend-copy.ts")) {
    add("REVIEW", "i18n", "TSX changed without lib/i18n/frontend-copy.ts — verify no raw copy was added (pnpm agent:audit-i18n)");
  } else {
    add("PASS", "i18n", "no new UI copy expected");
  }

  if (files.some((file) => UI_SURFACE.test(file))) {
    add("REVIEW", "accessibility", "TSX changed — confirm 44px targets and Radix aria state (visual-ui-reviewer)");
  } else {
    add("PASS", "accessibility", "no UI change");
  }

  if (files.length > 0 && !files.includes("memory/MEMORY.md")) {
    add("WARN", "memory", "memory/MEMORY.md not updated — AGENTS.md §7 requires a dated entry for every task");
  } else {
    add("PASS", "memory", "memory entry present or no change");
  }

  const areas = [...new Set(files.map(featureArea).filter(Boolean))];
  if (areas.length > 0) {
    const missing = areas.filter((area) => !specFor(area));
    if (missing.length > 0) {
      add("REVIEW", "spec", `no spec filename matches feature area(s): ${missing.join(", ")} — confirm a spec exists`);
    } else {
      add("PASS", "spec", `spec found for ${areas.join(", ")}`);
    }
  } else {
    add("PASS", "spec", "no feature module changed");
  }

  if (files.some((file) => SECURITY_SURFACE.test(file))) {
    add("REVIEW", "security", "auth/RLS/server-action surface changed — Security Agent review required");
  } else {
    add("PASS", "security", "no security-sensitive surface");
  }

  if (files.some((file) => SCHEMA_SURFACE.test(file))) {
    add("REVIEW", "schema", "schema/sync surface changed — run pnpm agent:schema and complete the migration checklist");
  } else {
    add("PASS", "schema", "no schema surface");
  }

  add(
    "UNKNOWN",
    "verification",
    "run pnpm agent:verify && pnpm agent:schema && pnpm agent:audit-i18n (and pnpm build for routes/schema); this script cannot infer results"
  );
  add("INFO", "review", "run the code-review skill over the same base; this checklist does not replace it");

  return items;
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2), { booleans: ["json", "strict", "help"] });
  if (flags.help) {
    process.stdout.write("Usage: node .ai/infra/scripts/review-checklist.mjs [--base main] [--json] [--strict]\n");
    return;
  }
  const base = typeof flags.base === "string" ? flags.base : "HEAD";
  const files = changedFiles(base);
  const items = buildChecklist(files);
  const blocking = items.filter((item) => item.status === "WARN" || item.status === "REVIEW");

  if (flags.json === true) {
    process.stdout.write(`${JSON.stringify({ base, files, items, blocking: blocking.length }, null, 2)}\n`);
    return;
  }

  process.stdout.write(`· PR quality checklist — base ${base}, ${files.length} changed file(s)\n`);
  for (const item of items) {
    process.stdout.write(`  ${item.status.padEnd(7)} ${item.item.padEnd(14)} ${item.detail}\n`);
  }
  process.stdout.write(
    blocking.length === 0
      ? "✔ no blocking checklist item\n"
      : `· ${blocking.length} item(s) need a human decision before merge\n`
  );
  if (flags.strict === true && blocking.length > 0) {
    process.stderr.write("✖ --strict: checklist has WARN/REVIEW items\n");
    process.exitCode = 1;
  }
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`✖ review checklist failed: ${error?.stack ?? error}\n`);
    process.exit(2);
  }
}
