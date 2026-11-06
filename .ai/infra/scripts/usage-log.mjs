#!/usr/bin/env node
/**
 * Optional, local AI-usage observability.
 *
 * Records *counts*, never content: model, token counts, tool calls, duration,
 * workflow, task id, and an optional cost. Prompts, source, diffs and responses
 * are rejected by name — this file must stay safe to keep on disk.
 *
 *   echo '{"model":"claude","inputTokens":1200,"outputTokens":300,"workflow":"feature"}' \
 *     | node .ai/infra/scripts/usage-log.mjs record
 *   node .ai/infra/scripts/usage-log.mjs record --json '{"model":"gpt-5","toolCalls":14}'
 *   node .ai/infra/scripts/usage-log.mjs report [--since 2026-11-01] [--json]
 *
 * The log lives at `.ai/infra/usage/usage-log.jsonl` (gitignored). No provider
 * telemetry is available to this repository, so every record is `source:
 * "manual"` unless a wrapper supplies another source. Missing fields are
 * allowed and reported as unknown — no cost is ever invented.
 *
 * Exit 0 = recorded / reported, 1 = rejected input, 2 = bad arguments.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, isMain, parseArgs, readText } from "./lib.mjs";
import { parseRuntimeEnv } from "../../../lib/config/runtime-env.mjs";

const runtimeEnv = parseRuntimeEnv();
const LOG = runtimeEnv.VIATIK_USAGE_LOG
  ? path.resolve(runtimeEnv.VIATIK_USAGE_LOG)
  : path.join(ROOT, ".ai/infra/usage/usage-log.jsonl");

/** Field names that would carry content. Rejected, not truncated. */
const FORBIDDEN = [
  "prompt",
  "prompts",
  "messages",
  "message",
  "content",
  "contents",
  "sourceCode",
  "code",
  "diff",
  "patch",
  "request",
  "response",
  "transcript",
  "stdout",
  "stderr",
];

const STRING_FIELDS = ["task", "agent", "model", "workflow", "provider", "source", "note"];
const NUMBER_FIELDS = ["inputTokens", "outputTokens", "toolCalls", "durationMs", "estimatedCostUsd"];

function readInput(flags) {
  if (typeof flags.json === "string") return flags.json;
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function validate(record) {
  const errors = [];
  for (const key of Object.keys(record)) {
    if (FORBIDDEN.includes(key)) {
      errors.push(`field "${key}" would store content; this log is counts-only`);
    }
    if (STRING_FIELDS.includes(key)) {
      if (typeof record[key] !== "string" || record[key].length > 120) {
        errors.push(`field "${key}" must be a string of at most 120 characters`);
      }
    }
    if (NUMBER_FIELDS.includes(key)) {
      const value = record[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        errors.push(`field "${key}" must be a non-negative number`);
      }
    }
  }
  if (record.timestamp !== undefined && Number.isNaN(Date.parse(String(record.timestamp)))) {
    errors.push('field "timestamp" must be an ISO date-time');
  }
  return errors;
}

function record(flags) {
  const raw = readInput(flags);
  if (!raw.trim()) {
    process.stderr.write("record needs JSON on stdin or --json '<json>'\n");
    return 2;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    process.stderr.write(`✖ input is not JSON: ${error.message}\n`);
    return 1;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    process.stderr.write("✖ input must be a JSON object\n");
    return 1;
  }
  const errors = validate(parsed);
  if (errors.length > 0) {
    process.stderr.write("✖ record rejected:\n");
    for (const error of errors) process.stderr.write(`    ${error}\n`);
    return 1;
  }
  const entry = {
    timestamp: parsed.timestamp ?? new Date().toISOString(),
    source: parsed.source ?? "manual",
    ...parsed,
  };
  mkdirSync(path.dirname(LOG), { recursive: true });
  appendFileSync(LOG, `${JSON.stringify(entry)}\n`, "utf8");
  process.stdout.write(`✔ usage recorded (${Object.keys(entry).length} fields, no content)\n`);
  return 0;
}

function loadEntries() {
  if (!existsSync(LOG)) return [];
  return readText(LOG)
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function aggregate(entries) {
  const totals = { runs: entries.length, inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: 0, costUsd: 0 };
  const withCost = [];
  const by = { workflow: {}, model: {}, agent: {} };
  for (const entry of entries) {
    for (const field of ["inputTokens", "outputTokens", "toolCalls", "durationMs"]) {
      if (typeof entry[field] === "number") totals[field] += entry[field];
    }
    if (typeof entry.estimatedCostUsd === "number") {
      totals.costUsd += entry.estimatedCostUsd;
      withCost.push(entry);
    }
    for (const group of ["workflow", "model", "agent"]) {
      const key = entry[group] ?? "unknown";
      by[group][key] = (by[group][key] ?? 0) + 1;
    }
  }
  return { totals, by, costCoverage: `${withCost.length}/${entries.length}` };
}

function report(flags) {
  const since = typeof flags.since === "string" ? Date.parse(flags.since) : null;
  const entries = loadEntries().filter((entry) => (since ? Date.parse(entry.timestamp) >= since : true));
  if (entries.length === 0) {
    process.stdout.write("· no usage records yet — see .ai/infra/usage-observability.md\n");
    return 0;
  }
  const summary = aggregate(entries);
  if (flags.json === true) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  }
  const { totals, by, costCoverage } = summary;
  process.stdout.write(`· AI usage — ${totals.runs} run(s)\n`);
  process.stdout.write(`  tokens        ${totals.inputTokens} in / ${totals.outputTokens} out\n`);
  process.stdout.write(`  tool calls    ${totals.toolCalls}\n`);
  process.stdout.write(`  duration      ${(totals.durationMs / 1000).toFixed(1)}s total\n`);
  process.stdout.write(`  cost          $${totals.costUsd.toFixed(4)} (reported for ${costCoverage} runs)\n`);
  for (const group of ["workflow", "model", "agent"]) {
    const rows = Object.entries(by[group]).sort((a, b) => b[1] - a[1]);
    if (rows.length === 0) continue;
    process.stdout.write(`  by ${group.padEnd(8)}  ${rows.map(([key, count]) => `${key}×${count}`).join(", ")}\n`);
  }
  process.stdout.write("· counts only; prompts, source and responses are never stored\n");
  return 0;
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2), { booleans: ["help"] });
  const command = positional[0];
  if (flags.help || !command) {
    process.stdout.write(
      "Usage: node .ai/infra/scripts/usage-log.mjs <record|report> [--json '<json>'|--json] [--since YYYY-MM-DD]\n"
    );
    return;
  }
  if (command === "record") {
    process.exitCode = record(flags);
    return;
  }
  if (command === "report") {
    process.exitCode = report(flags);
    return;
  }
  process.stderr.write(`unknown command: ${command} (try --help)\n`);
  process.exitCode = 2;
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`✖ usage log failed: ${error?.stack ?? error}\n`);
    process.exit(2);
  }
}
