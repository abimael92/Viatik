#!/usr/bin/env node
/**
 * Instruction and architecture drift report.
 *
 * Compares what the agent documentation *claims* against what the repository
 * actually contains. It reports; it never rewrites a document and never
 * restructures code.
 *
 *   node .ai/infra/scripts/drift-report.mjs
 *   node .ai/infra/scripts/drift-report.mjs --json
 *   node .ai/infra/scripts/drift-report.mjs --strict   # warnings fail too
 *
 * Pre-existing, deliberately accepted drift lives in
 * `.ai/infra/drift-baseline.json` with a reason and an expiry date. Accepted
 * findings print as KNOWN; once expired they fail again.
 *
 * Exit 0 = no unaccepted drift, 1 = drift (or an expired baseline).
 */
import path from "node:path";
import {
  ROOT,
  changedFiles,
  exists,
  finding,
  gitFiles,
  isMain,
  listFiles,
  parseArgs,
  readJson,
  readText,
  report,
  today,
} from "./lib.mjs";

const DOC_FILES = [
  "AGENTS.md",
  ".ai/CONTEXT.md",
  ".ai/llms.txt",
  ".ai/AGENTS.md",
  "memory/MEMORY.md",
  ".agents/skills/README.md",
  ".agents/mcp.md",
];

const NON_SCRIPT_VERBS = new Set([
  "add",
  "audit",
  "dlx",
  "exec",
  "install",
  "outdated",
  "peers",
  "prune",
  "remove",
  "run",
  "store",
  "unlink",
  "update",
  "why",
  "vitest",
  "eslint",
  "tsc",
]);

const DOCUMENTED_DIRS = ["app", "components", "features", "lib", "supabase", "e2e", "memory", ".ai", ".agents"];

/** Sync-contract symbols the documentation tells agents to look for. */
const CONTRACT_SYMBOLS = [
  "TransactionContext",
  "OutboxEntityType",
  "append",
  "get_profile_public_data",
  "SYNC_TABLE_DEFINITIONS",
];

const NUMBER_WORDS = {
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine",
  10: "ten",
  11: "eleven",
  12: "twelve",
  13: "thirteen",
  14: "fourteen",
  15: "fifteen",
  16: "sixteen",
  17: "seventeen",
  18: "eighteen",
  19: "nineteen",
  20: "twenty",
};

function major(version) {
  return String(version).split(".")[0];
}

/** Strips `^`, `~`, `>=` and workspace ranges from a package.json version. */
function clean(version) {
  return String(version ?? "").replace(/^[^\d]*/, "");
}

function versionClaims(pkg) {
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
  const next = clean(dependencies.next);
  const react = clean(dependencies.react);
  const dexie = clean(dependencies.dexie);
  const pnpm = clean(String(pkg.packageManager ?? "").split("@").pop());
  const claims = [
    { file: "AGENTS.md", label: "Next.js", expected: next, pattern: /Next\.js \*\*([\d.]+)\*\*/ },
    { file: "AGENTS.md", label: "React", expected: react, pattern: /React \*\*([\d.]+)\*\*/ },
    { file: "AGENTS.md", label: "Dexie", expected: dexie, pattern: /Dexie \*\*([\d.]+)\*\*/ },
    { file: "AGENTS.md", label: "pnpm", expected: pnpm, pattern: /\*\*pnpm (\d+\.\d+\.\d+)\*\*/ },
    { file: ".ai/CONTEXT.md", label: "Next.js major", expected: major(next), pattern: /Next\.js (\d+)/ },
    { file: ".ai/CONTEXT.md", label: "React major", expected: major(react), pattern: /React (\d+)/ },
    { file: "memory/MEMORY.md", label: "Next.js", expected: next, pattern: /Next\.js (\d+\.\d+\.\d+)/ },
    { file: "memory/MEMORY.md", label: "React", expected: react, pattern: /React (\d+\.\d+\.\d+)/ },
    { file: "memory/MEMORY.md", label: "Dexie", expected: dexie, pattern: /Dexie (\d+\.\d+\.\d+)/ },
    { file: "memory/MEMORY.md", label: "pnpm", expected: pnpm, pattern: /pnpm (\d+\.\d+\.\d+)/ },
  ];
  return claims;
}

function checkVersionClaims() {
  const findings = [];
  const pkg = readJson("package.json");
  if (!pkg) return [finding({ code: "package-json", file: "package.json", message: "cannot read package.json" })];

  for (const claim of versionClaims(pkg)) {
    if (!exists(claim.file)) continue;
    const source = readText(claim.file);
    const match = claim.pattern.exec(source);
    if (!match) {
      findings.push(
        finding({
          code: "version-claim-missing",
          file: claim.file,
          severity: "warn",
          message: `cannot find the ${claim.label} version claim; the drift check may be stale`,
          hint: "update the claim pattern in drift-report.mjs if the wording changed on purpose",
        })
      );
      continue;
    }
    if (match[1] !== claim.expected) {
      findings.push(
        finding({
          code: "version-drift",
          file: claim.file,
          message: `${claim.label} claim is ${match[1]} but package.json ships ${claim.expected}`,
          hint: "package.json is authoritative — update the documentation claim",
        })
      );
    }
  }
  return findings;
}

function schemaVersion() {
  const source = readText("lib/db/dexie.ts");
  const versions = [...source.matchAll(/this\.version\(\s*(\d+)\s*\)/g)].map((match) => Number(match[1]));
  return versions.length ? Math.max(...versions) : null;
}

function checkSchemaClaims() {
  const findings = [];
  const actual = schemaVersion();
  if (actual === null) {
    return [finding({ code: "schema-parse", file: "lib/db/dexie.ts", message: "no this.version(N) blocks found" })];
  }
  for (const file of ["AGENTS.md", "memory/MEMORY.md", "memory/data-models.md"]) {
    if (!exists(file)) continue;
    // Only the current snapshot line counts; §7 history and the data-model
    // changelog legitimately mention older versions.
    const match = /schema v(\d+)/.exec(readText(file));
    if (match && Number(match[1]) !== actual) {
      findings.push(
        finding({
          code: "schema-version-drift",
          file,
          message: `documentation says schema v${match[1]}; lib/db/dexie.ts declares v${actual}`,
          hint: "update the snapshot line; never edit a shipped Dexie version block",
        })
      );
    }
  }
  return findings;
}

function checkCommands() {
  const findings = [];
  const pkg = readJson("package.json");
  const scripts = new Set(Object.keys(pkg?.scripts ?? {}));
  const docs = [...DOC_FILES, ...listFiles(".agents/skills", { extensions: [".md"] }), ...listFiles(".ai/infra", { extensions: [".md"] })];
  const seen = new Set();

  for (const file of docs) {
    if (!exists(file)) continue;
    const source = readText(file);
    source.split(/\r?\n/).forEach((line, index) => {
      for (const match of line.matchAll(/\bpnpm ([a-z][a-z0-9:-]*)/g)) {
        const command = match[1];
        if (command.endsWith(":") || command.includes("*")) continue;
        if (NON_SCRIPT_VERBS.has(command) || scripts.has(command)) continue;
        const key = `${file}:${command}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push(
          finding({
            code: "command-drift",
            file,
            line: index + 1,
            message: `documented command "pnpm ${command}" does not exist in package.json scripts`,
            hint: "add the script or correct the documentation",
          })
        );
      }
    });
  }
  return findings;
}

function checkSkillCount() {
  const findings = [];
  const lock = readJson("skills-lock.json");
  if (!lock?.skills) return findings;
  const count = Object.keys(lock.skills).length;
  const word = NUMBER_WORDS[count];
  for (const file of ["AGENTS.md", ".agents/skills/README.md", "memory/MEMORY.md"]) {
    if (!exists(file)) continue;
    const source = readText(file);
    for (const match of source.matchAll(/(\d+)\s+community skills/g)) {
      if (Number(match[1]) !== count) {
        findings.push(
          finding({
            code: "skill-count-drift",
            file,
            message: `documentation says ${match[1]} community skills; skills-lock.json pins ${count}`,
          })
        );
      }
    }
    if (word) {
      for (const match of source.matchAll(/\b([A-Za-z]+) skills from the open registry/g)) {
        if (match[1].toLowerCase() !== word) {
          findings.push(
            finding({
              code: "skill-count-drift",
              file,
              message: `documentation says "${match[1]}" community skills; skills-lock.json pins ${count} (${word})`,
            })
          );
        }
      }
    }
  }
  return findings;
}

function checkDocumentedDirs() {
  return DOCUMENTED_DIRS.filter((dir) => !exists(dir)).map((dir) =>
    finding({
      code: "layout-drift",
      file: "AGENTS.md",
      message: `documented repository directory "${dir}/" does not exist`,
      hint: "update §4 of AGENTS.md if the layout changed on purpose",
    })
  );
}

/**
 * Application code only. Tooling under `.ai/` and `.agents/` quotes these
 * symbols in messages and docs, which would make the check pass on a string.
 */
function codeSources() {
  return gitFiles().filter(
    (file) =>
      /^(app|components|features|lib|supabase)\//.test(file) &&
      /\.(ts|tsx|sql)$/.test(file) &&
      !/\.(test|spec)\.tsx?$/.test(file)
  );
}

function checkContractSymbols() {
  const findings = [];
  const corpus = codeSources().map((file) => readText(file)).join("\n");
  for (const symbol of CONTRACT_SYMBOLS) {
    const pattern = new RegExp(`\\b${symbol}\\b`);
    if (!pattern.test(corpus)) {
      findings.push(
        finding({
          code: "contract-symbol-drift",
          file: "AGENTS.md",
          message: `documented contract symbol "${symbol}" does not exist anywhere in the code`,
          hint: "point the documentation at the real symbol, or record an accepted baseline with a reason",
        })
      );
    }
  }
  return findings;
}

function checkImportBoundaries() {
  const findings = [];
  const sources = codeSources();

  for (const file of sources) {
    if (!file.startsWith("app/") || file.startsWith("app/e2e/")) continue;
    const source = readText(file);
    if (/from\s+["'](?:@\/)?lib\/db\/dexie["']/.test(source)) {
      findings.push(
        finding({
          code: "boundary-dexie-in-app",
          file,
          message: "app/ must not import Dexie directly; go through a feature repository",
          hint: "AGENTS.md §3 rule 1",
        })
      );
    }
  }

  for (const file of sources) {
    if (!file.startsWith("features/")) continue;
    for (const match of readText(file).matchAll(/import\s+(?!type\b)([^;]*?)\s+from\s+["']@supabase\/supabase-js["']/g)) {
      findings.push(
        finding({
          code: "boundary-supabase-in-features",
          file,
          message: `features/ imports Supabase as a value (${match[1].trim()}); only type imports are allowed`,
          hint: "AGENTS.md §3 rule 2",
        })
      );
    }
  }
  return findings;
}

function parseSyncTables() {
  const source = readText("lib/sync/cloud-sync.ts");
  const entries = [];
  for (const line of source.split(/\r?\n/)) {
    const match = /table:\s*"([^"]+)"[\s\S]*?map:\s*(\w+)[\s\S]*?store:\s*"([^"]+)"/.exec(line);
    if (match) entries.push({ table: match[1], map: match[2], store: match[3] });
  }
  return entries;
}

function checkSyncContract() {
  const findings = [];
  if (!exists("lib/sync/cloud-sync.ts")) return findings;
  const entries = parseSyncTables();
  if (entries.length === 0) {
    findings.push(
      finding({
        code: "sync-parse",
        file: "lib/sync/cloud-sync.ts",
        message: "no tableDefinitions entries found; the sync-table contract check is stale",
        hint: "update parseSyncTables() in drift-report.mjs",
      })
    );
    return findings;
  }

  const dexie = readText("lib/db/dexie.ts");
  const mappers = exists("lib/supabase/mappers.ts") ? readText("lib/supabase/mappers.ts") : "";
  const migrations = listFiles("supabase/migrations", { extensions: [".sql"] })
    .map((file) => readText(file))
    .join("\n")
    .toLowerCase();

  for (const entry of entries) {
    if (!new RegExp(`\\b${entry.store}\\s*:`).test(dexie)) {
      findings.push(
        finding({
          code: "sync-store-missing",
          file: "lib/sync/cloud-sync.ts",
          message: `sync table "${entry.table}" writes to Dexie store "${entry.store}", which is not declared in lib/db/dexie.ts`,
        })
      );
    }
    if (mappers && !new RegExp(`export\\s+function\\s+${entry.map}\\s*\\(`).test(mappers)) {
      findings.push(
        finding({
          code: "sync-mapper-missing",
          file: "lib/supabase/mappers.ts",
          message: `mapper "${entry.map}" for sync table "${entry.table}" is not exported from mappers.ts`,
        })
      );
    }
    if (!new RegExp(`create table (if not exists )?(public\\.)?${entry.table}\\b`).test(migrations)) {
      findings.push(
        finding({
          code: "sync-migration-missing",
          file: "supabase/migrations",
          message: `sync table "${entry.table}" has no "create table" in supabase/migrations`,
          hint: "AGENTS.md §3 rule 6",
        })
      );
    }
  }
  return findings;
}

function applyBaseline(findings, baseline) {
  const accepted = Array.isArray(baseline?.accepted) ? baseline.accepted : [];
  const used = new Set();
  const applied = findings.map((item) => {
    const entry = accepted.find(
      (candidate) => candidate.code === item.code && candidate.file === item.file
    );
    if (!entry) return item;
    used.add(entry);
    if (entry.expiresAt && entry.expiresAt < today()) {
      return { ...item, message: `${item.message} (accepted baseline expired on ${entry.expiresAt})` };
    }
    return { ...item, severity: "known", message: `${item.message} — accepted: ${entry.reason ?? "no reason recorded"}` };
  });

  const stale = accepted.filter((entry) => !used.has(entry)).map((entry) =>
    finding({
      code: "baseline-stale",
      file: ".ai/infra/drift-baseline.json",
      severity: "warn",
      message: `baseline entry for ${entry.code} in ${entry.file} no longer matches a finding`,
      hint: "remove it so the baseline stays honest",
    })
  );
  return [...applied, ...stale];
}

export function run({ strict = false } = {}) {
  const findings = [
    ...checkVersionClaims(),
    ...checkSchemaClaims(),
    ...checkCommands(),
    ...checkSkillCount(),
    ...checkDocumentedDirs(),
    ...checkContractSymbols(),
    ...checkImportBoundaries(),
    ...checkSyncContract(),
  ];
  const baseline = readJson(".ai/infra/drift-baseline.json");
  const applied = applyBaseline(findings, baseline);
  if (strict) {
    return applied.map((item) => (item.severity === "warn" ? { ...item, severity: "error" } : item));
  }
  return applied;
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2), { booleans: ["json", "strict", "help"] });
  if (flags.help) {
    process.stdout.write("Usage: node .ai/infra/scripts/drift-report.mjs [--json] [--strict]\n");
    return;
  }
  const findings = run({ strict: flags.strict === true });
  const changed = changedFiles("HEAD").length;
  process.exitCode = report({
    title: `instruction + architecture drift — ${changed} uncommitted change(s), ${path.basename(ROOT)}`,
    findings,
    success: "documentation matches package.json, the Dexie schema, and the code",
    json: flags.json === true,
  });
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`✖ drift report crashed: ${error?.stack ?? error}\n`);
    process.exit(2);
  }
}
