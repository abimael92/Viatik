#!/usr/bin/env node
/**
 * Agent evaluation runner.
 *
 * Scenarios are JSON files under `.ai/infra/evaluations/scenarios/`. Each one
 * describes a situation, the behavior it expects, the behavior it prohibits, and
 * deterministic checks that prove the repository still contains the artifacts
 * that behavior depends on.
 *
 *   node .ai/infra/scripts/run-evaluations.mjs
 *   node .ai/infra/scripts/run-evaluations.mjs --list
 *   node .ai/infra/scripts/run-evaluations.mjs --scenario db-migration-safety
 *   node .ai/infra/scripts/run-evaluations.mjs --json
 *   node .ai/infra/scripts/run-evaluations.mjs --model-cmd "my-grader"
 *
 * Deterministic by default: no model call, no network. `--model-cmd` is the
 * optional extension point — it receives one scenario JSON on stdin and must
 * print `{"pass": true|false, "rationale": "..."}`. It is never used in CI.
 *
 * Exit 0 = every selected scenario passed, 1 = a check failed, 2 = bad scenario.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { ROOT, isMain, listFiles, parseArgs, readJson, readText } from "./lib.mjs";

const SCENARIO_DIR = ".ai/infra/evaluations/scenarios";
const REQUIRED_KEYS = [
  "id",
  "title",
  "category",
  "prompt",
  "initialContext",
  "expectedBehavior",
  "prohibitedBehavior",
  "criteria",
  "deterministicChecks",
];

function loadScenarios() {
  if (!existsSync(`${ROOT}/${SCENARIO_DIR}`)) return [];
  return listFiles(SCENARIO_DIR, { extensions: [".json"] }).map((file) => {
    const data = readJson(file);
    return { file, data };
  });
}

function runCheck(check) {
  switch (check.type) {
    case "file-exists": {
      const ok = existsSync(`${ROOT}/${check.path}`);
      return { ok, detail: `${check.path} ${ok ? "exists" : "is missing"}` };
    }
    case "file-contains": {
      if (!existsSync(`${ROOT}/${check.path}`)) return { ok: false, detail: `${check.path} is missing` };
      const source = readText(check.path);
      const pattern = new RegExp(check.pattern, check.flags ?? "");
      const ok = pattern.test(source);
      return { ok, detail: `${check.path} ${ok ? "contains" : "does not contain"} /${check.pattern}/` };
    }
    case "file-not-contains": {
      if (!existsSync(`${ROOT}/${check.path}`)) return { ok: false, detail: `${check.path} is missing` };
      const pattern = new RegExp(check.pattern, check.flags ?? "");
      const ok = !pattern.test(readText(check.path));
      return { ok, detail: `${check.path} ${ok ? "does not contain" : "still contains"} /${check.pattern}/` };
    }
    case "json-field": {
      const data = readJson(check.path);
      if (!data) return { ok: false, detail: `${check.path} is missing or not JSON` };
      const value = check.field.split(".").reduce((node, key) => (node == null ? undefined : node[key]), data);
      const ok = check.exists === false ? value === undefined : value !== undefined;
      return { ok, detail: `${check.path}#${check.field} ${ok ? "present" : "absent"}` };
    }
    case "script-exits-zero": {
      try {
        execFileSync(check.command, check.args ?? [], { cwd: ROOT, stdio: "ignore", timeout: 120_000 });
        return { ok: true, detail: `${check.command} ${(check.args ?? []).join(" ")} exited 0` };
      } catch {
        return { ok: false, detail: `${check.command} ${(check.args ?? []).join(" ")} failed` };
      }
    }
    default:
      return { ok: false, detail: `unknown check type "${check.type}"` };
  }
}

function runScenario(scenario) {
  const missing = REQUIRED_KEYS.filter((key) => scenario[key] === undefined);
  if (missing.length > 0) {
    return { id: scenario.id ?? "unknown", ok: false, checks: [], error: `missing keys: ${missing.join(", ")}` };
  }
  const checks = scenario.deterministicChecks.map((check) => ({ check, ...runCheck(check) }));
  return { id: scenario.id, ok: checks.every((item) => item.ok), checks, error: null };
}

/** Optional model-based grading. Never used unless the caller opts in. */
function gradeWithModel(command, scenario) {
  try {
    const output = execFileSync(command, {
      cwd: ROOT,
      input: JSON.stringify(scenario),
      encoding: "utf8",
      shell: true,
      timeout: 180_000,
    });
    const verdict = JSON.parse(output);
    return { ok: Boolean(verdict.pass), rationale: String(verdict.rationale ?? "") };
  } catch (error) {
    return { ok: false, rationale: `model grader failed: ${error.message}` };
  }
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2), { booleans: ["list", "json", "help"] });
  if (flags.help) {
    process.stdout.write(
      "Usage: node .ai/infra/scripts/run-evaluations.mjs [--list] [--scenario id] [--json] [--model-cmd command]\n"
    );
    return;
  }

  const loaded = loadScenarios();
  if (loaded.length === 0) {
    process.stderr.write(`✖ no scenarios found in ${SCENARIO_DIR}\n`);
    process.exitCode = 2;
    return;
  }
  const duplicates = loaded.map((entry) => entry.data?.id).filter((id, index, all) => id && all.indexOf(id) !== index);
  if (duplicates.length > 0) {
    process.stderr.write(`✖ duplicate scenario id(s): ${[...new Set(duplicates)].join(", ")}\n`);
    process.exitCode = 2;
    return;
  }

  if (flags.list === true) {
    for (const entry of loaded) {
      process.stdout.write(`· ${entry.data?.id ?? "invalid"} — ${entry.data?.title ?? entry.file}\n`);
    }
    return;
  }

  const selected = typeof flags.scenario === "string" ? loaded.filter((entry) => entry.data?.id === flags.scenario) : loaded;
  if (selected.length === 0) {
    process.stderr.write(`✖ unknown scenario "${flags.scenario}" (try --list)\n`);
    process.exitCode = 2;
    return;
  }

  const results = selected.map((entry) => {
    const result = runScenario(entry.data ?? {});
    if (typeof flags["model-cmd"] === "string") {
      result.model = gradeWithModel(flags["model-cmd"], entry.data);
      result.ok = result.ok && result.model.ok;
    }
    return { file: entry.file, ...result };
  });

  const failed = results.filter((result) => !result.ok);
  if (flags.json === true) {
    process.stdout.write(`${JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2)}\n`);
    process.exitCode = failed.length === 0 ? 0 : 1;
    return;
  }

  for (const result of results) {
    process.stdout.write(`${result.ok ? "✔" : "✖"} ${result.id}\n`);
    if (result.error) process.stdout.write(`    ${result.error}\n`);
    for (const item of result.checks.filter((entry) => !entry.ok)) {
      process.stdout.write(`    ✖ ${item.detail}\n`);
    }
    if (result.model) {
      process.stdout.write(`    model grader: ${result.model.ok ? "pass" : "fail"} — ${result.model.rationale}\n`);
    }
  }
  process.stdout.write(
    `\n${results.length - failed.length}/${results.length} scenario(s) passed — deterministic checks only${
      typeof flags["model-cmd"] === "string" ? " (plus model grader)" : ""
    }\n`
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`✖ evaluation runner crashed: ${error?.stack ?? error}\n`);
    process.exit(2);
  }
}
