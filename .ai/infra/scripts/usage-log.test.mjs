import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TIMEOUT = 30_000;
const SCRIPT = path.join(process.cwd(), ".ai/infra/scripts/usage-log.mjs");
let dir;
let logFile;

function run(args, input = "") {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    input,
    env: { ...process.env, VIATIK_USAGE_LOG: logFile },
  }, TIMEOUT);
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "viatik-usage-"));
  logFile = path.join(dir, "usage-log.jsonl");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("usage-log.mjs", () => {
  it("records counts and never content", () => {
    const record = run(["record", "--json", '{"model":"m","inputTokens":10,"workflow":"feature"}']);
    expect(record.status).toBe(0);
    expect(record.stdout).toContain("no content");
  }, TIMEOUT);

  it("rejects prompt and source fields", () => {
    const prompt = run(["record"], '{"prompt":"do not store me"}');
    expect(prompt.status).toBe(1);
    expect(prompt.stderr).toContain("counts-only");

    const code = run(["record"], '{"code":"const x = 1"}');
    expect(code.status).toBe(1);
  }, TIMEOUT);

  it("aggregates runs and reports cost coverage", () => {
    run(["record"], '{"model":"a","inputTokens":100,"estimatedCostUsd":0.01,"workflow":"feature"}');
    run(["record"], '{"model":"b","toolCalls":3,"workflow":"review"}');

    const report = run(["report"]);
    expect(report.status).toBe(0);
    expect(report.stdout).toContain("2 run(s)");
    expect(report.stdout).toContain("reported for 1/2 runs");
    expect(report.stdout).toContain("feature×1");
  }, TIMEOUT);

  it("reports an empty ledger without failing", () => {
    const report = run(["report"]);
    expect(report.status).toBe(0);
    expect(report.stdout).toContain("no usage records yet");
  }, TIMEOUT);
});
