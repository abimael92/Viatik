#!/usr/bin/env node
/**
 * Test reliability ledger.
 *
 * Ingests a Vitest JSON report and reports repeated failures, flaky candidates,
 * slow tests, skipped tests, and duration trend. It never skips, quarantines,
 * or rewrites a test — the ledger is evidence, not a gate.
 *
 *   node .ai/infra/scripts/test-health.mjs ingest .ai/infra/.test-report.json
 *   node .ai/infra/scripts/test-health.mjs report [--json]
 *   node .ai/infra/scripts/test-health.mjs run            # full suite, then ingest + report
 *   node .ai/infra/scripts/test-health.mjs run -- lib/i18n/i18n-coverage.test.ts
 *
 * The ledger (`.ai/infra/test-health.json`, last 20 runs) is gitignored: it
 * changes on every run and must not dirty the tree. `--json` is the CI-friendly
 * form. Exit 0 = reported, 1 = the wrapped `run` failed its tests, 2 = bad input.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT, isMain, parseArgs, readJson, readText } from "./lib.mjs";

const LEDGER = process.env.VIATIK_TEST_HEALTH_FILE
  ? path.resolve(process.env.VIATIK_TEST_HEALTH_FILE)
  : path.join(ROOT, ".ai/infra/test-health.json");

const REPORT = path.join(ROOT, ".ai/infra/.test-report.json");
const MAX_RUNS = 20;

function loadLedger() {
  const ledger = existsSync(LEDGER) ? readJson(LEDGER) : null;
  return ledger?.runs ? ledger : { version: 1, runs: [] };
}

function saveLedger(ledger) {
  mkdirSync(path.dirname(LEDGER), { recursive: true });
  const runs = ledger.runs.slice(-MAX_RUNS);
  writeFileSync(LEDGER, `${JSON.stringify({ version: 1, runs }, null, 2)}\n`, "utf8");
}

function summarize(report, source) {
  const results = Array.isArray(report.testResults) ? report.testResults : [];
  const failedTests = [];
  const slowest = [];
  let durationMs = 0;
  const skipped = Number(report.numPendingTests ?? 0) + Number(report.numTodoTests ?? 0);

  for (const suite of results) {
    const suiteDuration = Math.max(0, Number(suite.endTime ?? 0) - Number(suite.startTime ?? 0));
    durationMs += suiteDuration;
    for (const assertion of suite.assertionResults ?? []) {
      const entry = {
        name: assertion.fullName ?? assertion.title ?? "unknown",
        file: suite.name ? path.relative(ROOT, suite.name).split(path.sep).join("/") : "unknown",
        durationMs: Math.round(Number(assertion.duration ?? 0) * 100) / 100,
      };
      if (assertion.status === "failed") failedTests.push(entry);
      slowest.push(entry);
    }
  }

  slowest.sort((a, b) => b.durationMs - a.durationMs);
  return {
    at: new Date().toISOString(),
    source,
    success: Boolean(report.success),
    files: results.length,
    total: Number(report.numTotalTests ?? 0),
    passed: Number(report.numPassedTests ?? 0),
    failed: Number(report.numFailedTests ?? failedTests.length),
    skipped,
    durationMs,
    failedTests,
    slowest: slowest.slice(0, 10),
  };
}

function ingest(file) {
  if (!file || !existsSync(path.resolve(ROOT, file))) {
    process.stderr.write(`✖ report not found: ${file ?? "(none)"}\n`);
    return 2;
  }
  let report;
  try {
    report = JSON.parse(readText(file));
  } catch (error) {
    process.stderr.write(`✖ report is not JSON: ${error.message}\n`);
    return 2;
  }
  const ledger = loadLedger();
  ledger.runs.push(summarize(report, path.basename(file)));
  saveLedger(ledger);
  const latest = ledger.runs.at(-1);
  process.stdout.write(
    `✔ ingested ${latest.total} test(s) from ${latest.files} file(s): ${latest.passed} passed, ${latest.failed} failed, ${latest.skipped} skipped\n`
  );
  return 0;
}

function analyse(runs) {
  const failures = new Map();
  const passes = new Map();
  const durations = new Map();
  for (const run of runs) {
    for (const test of run.failedTests ?? []) {
      failures.set(test.name, (failures.get(test.name) ?? 0) + 1);
    }
    for (const test of run.slowest ?? []) {
      if (!test.durationMs) continue;
      const entry = durations.get(test.name) ?? { total: 0, count: 0, file: test.file };
      entry.total += test.durationMs;
      entry.count += 1;
      durations.set(test.name, entry);
    }
  }
  // A pass is only observable for tests that appear in `slowest` or that ran;
  // the report does not list every passing test, so flakiness is inferred from
  // failure counts across runs plus the run-level success flag.
  for (const run of runs) {
    for (const test of run.slowest ?? []) {
      if (!failures.has(test.name)) passes.set(test.name, (passes.get(test.name) ?? 0) + 1);
    }
  }
  const repeated = [...failures.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);
  const flaky = [...failures.entries()]
    .filter(([name, count]) => count < runs.length && passes.has(name))
    .sort((a, b) => b[1] - a[1]);
  const slow = [...durations.entries()]
    .map(([name, entry]) => ({ name, file: entry.file, avgMs: Math.round((entry.total / entry.count) * 100) / 100 }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 10);
  return { repeated, flaky, slow };
}

function report(flags) {
  const ledger = loadLedger();
  if (ledger.runs.length === 0) {
    process.stdout.write("· no test-health runs yet — `node .ai/infra/scripts/test-health.mjs run`\n");
    return 0;
  }
  const latest = ledger.runs.at(-1);
  const analysis = analyse(ledger.runs);
  if (flags.json === true) {
    process.stdout.write(`${JSON.stringify({ latest, ...analysis, runs: ledger.runs.length }, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(`· test health — ${ledger.runs.length} recorded run(s)\n`);
  process.stdout.write(
    `  latest       ${latest.at} · ${latest.passed}/${latest.total} passed, ${latest.failed} failed, ${latest.skipped} skipped · ${(latest.durationMs / 1000).toFixed(1)}s\n`
  );
  const trend = ledger.runs.slice(-5).map((run) => (run.durationMs / 1000).toFixed(1));
  process.stdout.write(`  duration     last 5 runs: ${trend.join("s, ")}s\n`);
  if (analysis.repeated.length > 0) {
    process.stdout.write("  repeated failures (>=2 runs)\n");
    for (const [name, count] of analysis.repeated) process.stdout.write(`    ${count}× ${name}\n`);
  } else {
    process.stdout.write("  repeated failures  none\n");
  }
  if (analysis.flaky.length > 0) {
    process.stdout.write("  flaky candidates (failed some runs, observed passing in others)\n");
    for (const [name, count] of analysis.flaky) process.stdout.write(`    ${count}/${ledger.runs.length} failed · ${name}\n`);
  } else {
    process.stdout.write("  flaky candidates   none observed\n");
  }
  if (analysis.slow.length > 0) {
    process.stdout.write("  slowest tests (average across runs)\n");
    for (const test of analysis.slow.slice(0, 5)) {
      process.stdout.write(`    ${test.avgMs.toFixed(1)}ms · ${test.name} (${test.file})\n`);
    }
  }
  process.stdout.write(
    "· no test is quarantined or skipped by this tool; a repeated failure is a regression until proven environmental\n"
  );
  return 0;
}

function run(passthrough) {
  mkdirSync(path.dirname(REPORT), { recursive: true });
  const args = ["exec", "vitest", "run", "--reporter=json", `--outputFile=${REPORT}`, ...passthrough];
  let status = 0;
  try {
    execFileSync("pnpm", args, { cwd: ROOT, stdio: "inherit" });
  } catch (error) {
    status = typeof error.status === "number" ? error.status : 1;
  }
  const ingestStatus = ingest(path.relative(ROOT, REPORT));
  report({});
  return ingestStatus === 0 ? (status === 0 ? 0 : 1) : ingestStatus;
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2), { booleans: ["json", "help"] });
  const command = positional[0];
  if (flags.help || !command) {
    process.stdout.write(
      "Usage: node .ai/infra/scripts/test-health.mjs <ingest <report.json>|report|run> [--json] [-- <vitest args>]\n"
    );
    return;
  }
  if (command === "ingest") {
    process.exitCode = ingest(positional[1]);
    return;
  }
  if (command === "report") {
    process.exitCode = report(flags);
    return;
  }
  if (command === "run") {
    process.exitCode = run(positional.slice(1));
    return;
  }
  process.stderr.write(`unknown command: ${command} (try --help)\n`);
  process.exitCode = 2;
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`✖ test health failed: ${error?.stack ?? error}\n`);
    process.exit(2);
  }
}
