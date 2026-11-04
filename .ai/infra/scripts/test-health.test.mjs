import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TIMEOUT = 30_000;
const SCRIPT = path.join(process.cwd(), ".ai/infra/scripts/test-health.mjs");
let dir;
let ledgerFile;

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, VIATIK_TEST_HEALTH_FILE: ledgerFile },
  }, TIMEOUT);
}

function vitestReport({ failed }) {
  return {
    numTotalTests: 3,
    numPassedTests: 3 - failed.length,
    numFailedTests: failed.length,
    numPendingTests: 0,
    numTodoTests: 0,
    success: failed.length === 0,
    testResults: [
      {
        name: "/repo/features/x/a.test.ts",
        startTime: 0,
        endTime: 120,
        status: failed.length ? "failed" : "passed",
        assertionResults: [
          { fullName: "suite stable test", status: "passed", duration: 5 },
          { fullName: "suite slow test", status: "passed", duration: 80 },
          ...failed.map((name) => ({ fullName: name, status: "failed", duration: 2 })),
        ],
      },
    ],
  };
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "viatik-health-"));
  ledgerFile = path.join(dir, "test-health.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("test-health.mjs", () => {
  it("ingests a report and summarizes the run", () => {
    const reportPath = path.join(dir, "report.json");
    writeFileSync(reportPath, JSON.stringify(vitestReport({ failed: [] })));
    const ingest = run(["ingest", reportPath]);
    expect(ingest.status).toBe(0);
    expect(ingest.stdout).toContain("3 passed");
  }, TIMEOUT);

  it("reports a test that failed in two runs", () => {
    const reportPath = path.join(dir, "report.json");
    writeFileSync(reportPath, JSON.stringify(vitestReport({ failed: ["suite flaky test"] })));
    run(["ingest", reportPath]);
    run(["ingest", reportPath]);

    const report = run(["report"]);
    expect(report.status).toBe(0);
    expect(report.stdout).toContain("repeated failures");
    expect(report.stdout).toContain("2× suite flaky test");
    expect(report.stdout).toContain("no test is quarantined");
  }, TIMEOUT);

  it("rejects a missing report", () => {
    expect(run(["ingest", path.join(dir, "nope.json")]).status).toBe(2);
  }, TIMEOUT);
});
