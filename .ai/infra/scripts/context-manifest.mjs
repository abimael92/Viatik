#!/usr/bin/env node
/**
 * Task context manifest and change-impact analysis.
 *
 * Given the files a task will touch (or the current diff), print the smallest
 * set of documents, specs, skills, memory topics, modules, verification
 * commands, and regression areas an agent needs. This is a deterministic map,
 * not an index: it reads path patterns and the spec filenames already in the
 * repository.
 *
 *   node .ai/infra/scripts/context-manifest.mjs
 *   node .ai/infra/scripts/context-manifest.mjs --files lib/db/dexie.ts,features/expenses/data/x.ts
 *   node .ai/infra/scripts/context-manifest.mjs --impact     # + regression / contract / test plan
 *   node .ai/infra/scripts/context-manifest.mjs --json
 *
 * Advisory: always exits 0 unless the manifest itself cannot be built.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { ROOT, changedFiles, exists, isMain, listFiles, parseArgs } from "./lib.mjs";

/**
 * One row per path family. `docs` are files to read, `skills` are cards or
 * wrapper names to invoke, `verify` are commands that must run, `impact` names
 * the regression surface a reviewer should look at.
 */
const RULES = [
  {
    id: "dexie-schema",
    match: /^lib\/db\//,
    docs: ["memory/data-models.md", "AGENTS.md §3 (rules 1, 3, 5, 6)"],
    skills: ["spec-first-design", "dexie-schema-guardian"],
    memory: ["memory/data-models.md"],
    modules: ["lib/db", "lib/sync", "lib/supabase"],
    verify: ["pnpm agent:schema", "pnpm agent:verify", "pnpm build"],
    impact: "Dexie migration must be additive; Supabase migration + RLS + mappers + sync table list required",
  },
  {
    id: "sync-engine",
    match: /^lib\/sync\//,
    docs: ["memory/data-models.md", "AGENTS.md §3 (rules 3, 8)"],
    skills: ["spec-first-design", "dexie-schema-guardian"],
    memory: ["memory/data-models.md"],
    modules: ["lib/sync", "lib/db", "lib/supabase"],
    verify: ["pnpm agent:schema", "pnpm agent:verify"],
    impact: "Outbox writes must stay inside TransactionContext.runInTransaction + append(); offline path must not regress",
  },
  {
    id: "supabase",
    match: /^supabase\//,
    docs: ["memory/roles-abilities.md", "memory/data-models.md", "AGENTS.md §3 (rules 6, 7)"],
    skills: ["spec-first-design"],
    memory: ["memory/roles-abilities.md"],
    modules: ["supabase/migrations", "lib/supabase"],
    verify: ["pnpm typecheck", "pnpm test", "pnpm build"],
    impact: "RLS policy + negative authorization test; client canEdit stays UX-only",
  },
  {
    id: "repository",
    match: /^features\/[^/]+\/data\//,
    docs: ["memory/data-models.md", "AGENTS.md §3 (rule 3)"],
    skills: ["tdd", "dexie-schema-guardian"],
    memory: ["memory/data-models.md"],
    modules: ["features/<area>/data", "lib/sync"],
    verify: ["pnpm agent:schema", "pnpm agent:verify"],
    impact: "Domain row + outbox entry in one transaction; local-only tables append nothing",
  },
  {
    id: "feature-ui",
    match: /^features\/[^/]+\/(components|lib)\//,
    docs: ["memory/components-ui.md", ".ai/specs/design-system.md"],
    skills: ["frontend-design", "visual-ui-reviewer", "i18n-checker"],
    memory: ["memory/components-ui.md"],
    modules: ["features/<area>/components", "components/ui"],
    verify: ["pnpm agent:audit-i18n", "pnpm agent:verify"],
    impact: "Copy through t(); 44px targets; no direct Dexie/Supabase access from a component",
  },
  {
    id: "shared-ui",
    match: /^(components|app\/globals\.css)\//,
    docs: ["memory/components-ui.md", ".ai/specs/design-system.md"],
    skills: ["frontend-design", "visual-ui-reviewer", "i18n-checker"],
    memory: ["memory/components-ui.md"],
    modules: ["components/ui", "app/globals.css"],
    verify: ["pnpm agent:audit-i18n", "pnpm agent:verify"],
    impact: "Shared primitive change — every consumer is a regression surface",
  },
  {
    id: "routes",
    match: /^app\/(?!.*\.test\.)/,
    docs: ["memory/components-ui.md", "AGENTS.md §3 (rules 2, 8)"],
    skills: ["spec-first-design", "visual-ui-reviewer"],
    memory: ["memory/components-ui.md"],
    modules: ["app", "proxy.ts"],
    verify: ["pnpm typecheck", "pnpm build", "pnpm agent:verify"],
    impact: "Server/client boundary, auth redirect, and build output for a routing change",
  },
  {
    id: "server-actions",
    match: /^app\/actions\//,
    docs: ["memory/roles-abilities.md", "AGENTS.md §3 (rule 2)"],
    skills: ["spec-first-design"],
    memory: ["memory/roles-abilities.md"],
    modules: ["app/actions", "lib/supabase"],
    verify: ["pnpm typecheck", "pnpm test"],
    impact: "Server-side authorization; never import Dexie here",
  },
  {
    id: "i18n",
    match: /^lib\/i18n\//,
    docs: ["memory/components-ui.md"],
    skills: ["i18n-checker"],
    memory: ["memory/components-ui.md"],
    modules: ["lib/i18n"],
    verify: ["pnpm agent:audit-i18n", "pnpm test"],
    impact: "Every key must exist in en and es; no orphaned keys",
  },
  {
    id: "money",
    match: /^(features\/domain\/money|features\/(expenses|finance)\/)/,
    docs: ["memory/data-models.md", ".ai/specs/money-domain.md"],
    skills: ["tdd", "spec-first-design"],
    memory: ["memory/data-models.md"],
    modules: ["features/domain/money.ts", "features/expenses", "features/finance"],
    verify: ["pnpm test", "pnpm typecheck"],
    impact: "bigint minor units only; settlement ledger is append-only",
  },
  {
    id: "tests",
    match: /\.(test|spec)\.(ts|tsx|mjs)$/,
    docs: ["AGENTS.md §5"],
    skills: ["smart-test-runner"],
    memory: [],
    modules: [],
    verify: ["pnpm exec vitest run <file>"],
    impact: "Test-only change: confirm it fails for the right reason before trusting a green run",
  },
  {
    id: "agent-infra",
    match: /^(\.ai|\.agents|memory)\/|^(AGENTS|CLAUDE)\.md$|^skills-lock\.json$|^mcp\.json$/,
    docs: [".ai/infra/README.md", ".ai/infra/permission-model.md", "AGENTS.md §12"],
    skills: ["git-session-closer"],
    memory: ["memory/MEMORY.md"],
    modules: [".ai/infra", ".agents/skills", "memory"],
    verify: ["pnpm agent:infra", "pnpm agent:drift", "pnpm agent:security", "pnpm agent:eval"],
    impact: "Infrastructure change: validation, drift, security audit and evaluations must all pass",
  },
  {
    id: "dependencies",
    match: /^(package\.json|pnpm-lock\.yaml)$/,
    docs: ["AGENTS.md §2"],
    skills: ["spec-first-design"],
    memory: ["memory/MEMORY.md"],
    modules: ["package.json"],
    verify: ["pnpm install", "pnpm agent:verify", "pnpm build"],
    impact: "Dependency review: pinned version, published >7 days, lockfile committed, no runtime bloat",
  },
];

const BASELINE_DOCS = ["AGENTS.md", ".ai/constitution.md", ".ai/CONTEXT.md", "memory/MEMORY.md"];

/** Path words that say nothing about the feature and only add spec noise. */
const STOPWORDS = new Set([
  "app",
  "components",
  "data",
  "features",
  "hooks",
  "index",
  "lib",
  "repository",
  "test",
  "tests",
  "types",
  "utils",
]);

function matches(rule, file) {
  return rule.match.test(file);
}

/** Specs whose filename shares a meaningful token with a changed path. */
function relatedSpecs(files) {
  if (!exists(".ai/specs")) return [];
  const specs = listFiles(".ai/specs", { extensions: [".md"] });
  const tokens = new Set();
  for (const file of files) {
    const parts = file.split("/");
    for (const part of parts) {
      for (const token of part.replace(/\.[^.]+$/, "").split(/[^a-z0-9]+/)) {
        const normalized = token.toLowerCase();
        if (normalized.length >= 4 && !STOPWORDS.has(normalized)) tokens.add(normalized);
      }
    }
  }
  return specs
    .filter((spec) => {
      const name = path.posix.basename(spec, ".md").toLowerCase();
      return [...tokens].some((token) => name.includes(token));
    })
    .slice(0, 8);
}

function runTestPlan(explicit) {
  if (!exists(".agents/skills/test-runner.sh")) return null;
  // The runner maps the working-tree diff; an explicit file list has no diff
  // to map, so do not pretend it does.
  if (explicit) return null;
  try {
    return execFileSync("bash", [".agents/skills/test-runner.sh", "--dry-run"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

export function buildManifest({ files, impact = false, explicit = false }) {
  const matched = RULES.filter((rule) => files.some((file) => matches(rule, file)));
  const dedupe = (values) => [...new Set(values.filter(Boolean))];
  const specs = relatedSpecs(files);
  return {
    files,
    docs: dedupe([...BASELINE_DOCS, ...matched.flatMap((rule) => rule.docs)]),
    specs,
    skills: dedupe(matched.flatMap((rule) => rule.skills)),
    memory: dedupe(matched.flatMap((rule) => rule.memory)),
    modules: dedupe(matched.flatMap((rule) => rule.modules)),
    verify: dedupe(matched.flatMap((rule) => rule.verify)),
    rules: matched.map((rule) => rule.id),
    impact: impact
      ? {
          areas: dedupe(matched.map((rule) => rule.impact)),
          tests: runTestPlan(explicit),
        }
      : null,
  };
}

function printManifest(manifest) {
  const section = (title, values) => {
    process.stdout.write(`\n${title}\n`);
    if (values.length === 0) {
      process.stdout.write("  · none\n");
      return;
    }
    for (const value of values) process.stdout.write(`  · ${value}\n`);
  };

  process.stdout.write(`· task context manifest — ${manifest.files.length} file(s), rules: ${manifest.rules.join(", ") || "none"}\n`);
  if (manifest.files.length > 0) {
    section("Changed files", manifest.files);
  }
  section("Read first", manifest.docs);
  section("Specs", manifest.specs);
  section("Skills to invoke", manifest.skills);
  section("Memory topics", manifest.memory);
  section("Affected modules", manifest.modules);
  section("Verification commands", manifest.verify);
  if (manifest.impact) {
    section("Impact — regression areas", manifest.impact.areas);
    process.stdout.write("\nImpact — affected tests\n");
    if (manifest.impact.tests) {
      for (const line of manifest.impact.tests.split("\n")) process.stdout.write(`  ${line}\n`);
    } else {
      process.stdout.write("  · test-runner unavailable; run `bash .agents/skills/test-runner.sh --dry-run`\n");
    }
  }
  process.stdout.write("\n· this manifest is advisory; AGENTS.md stays the entry point\n");
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2), { booleans: ["impact", "json", "help"] });
  if (flags.help) {
    process.stdout.write(
      "Usage: node .ai/infra/scripts/context-manifest.mjs [--impact] [--json] [--files a,b] [--base HEAD]\n"
    );
    return;
  }
  const explicit = typeof flags.files === "string" ? flags.files.split(",").map((file) => file.trim()).filter(Boolean) : null;
  const files = explicit ?? changedFiles(typeof flags.base === "string" ? flags.base : "HEAD");
  const manifest = buildManifest({ files, impact: flags.impact === true, explicit: explicit !== null });
  if (flags.json === true) {
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }
  printManifest(manifest);
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`✖ context manifest failed: ${error?.stack ?? error}\n`);
    process.exit(2);
  }
}
