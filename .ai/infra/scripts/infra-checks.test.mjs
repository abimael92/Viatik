import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { run as runDrift } from "./drift-report.mjs";
import { run as runSecurity } from "./security-audit.mjs";
import { run as runValidate } from "./validate-infra.mjs";

const here = (name) => path.join(process.cwd(), ".ai/infra/scripts", name);
const TIMEOUT = 30_000;

function run(script, args = []) {
  return spawnSync(process.execPath, [here(script), ...args], { encoding: "utf8" });
}

describe("validate-infra.mjs", () => {
  it("finds no error on this repository", () => {
    const findings = runValidate();
    expect(findings.filter((item) => item.severity === "error")).toEqual([]);
  }, TIMEOUT);

  it("exits 0 and emits JSON", () => {
    const result = run("validate-infra.mjs", ["--json"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(true);
  }, TIMEOUT);

  it("prints usage on --help", () => {
    expect(run("validate-infra.mjs", ["--help"]).status).toBe(0);
  }, TIMEOUT);

  it("reports pinned skill provenance without claiming a recomputed hash", () => {
    const result = run("validate-infra.mjs", ["--provenance"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("skill provenance");
    expect(result.stdout).toContain("not recomputed locally");
  }, TIMEOUT);
});

describe("drift-report.mjs", () => {
  it("reports no unaccepted drift on this repository", () => {
    const findings = runDrift();
    expect(findings.filter((item) => item.severity === "error")).toEqual([]);
  }, TIMEOUT);

  it("keeps accepted drift visible as a known finding", () => {
    const findings = runDrift();
    expect(findings.some((item) => item.severity === "known")).toBe(true);
  }, TIMEOUT);

  it("exits 0", () => {
    expect(run("drift-report.mjs").status).toBe(0);
  }, TIMEOUT);
});

describe("security-audit.mjs", () => {
  it("finds no secret, unpinned package or unsafe shell snippet", () => {
    const findings = runSecurity();
    expect(findings.filter((item) => item.severity === "error")).toEqual([]);
  }, TIMEOUT);

  it("exits 0", () => {
    expect(run("security-audit.mjs").status).toBe(0);
  }, TIMEOUT);
});

describe("run-evaluations.mjs", () => {
  it("runs ten scenarios and passes all of them", () => {
    const result = run("run-evaluations.mjs", ["--json"]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.results).toHaveLength(10);
    expect(parsed.failed).toBe(0);
  }, TIMEOUT);

  it("lists scenarios without running them", () => {
    const result = run("run-evaluations.mjs", ["--list"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("db-migration-safety");
  }, TIMEOUT);

  it("rejects an unknown scenario", () => {
    expect(run("run-evaluations.mjs", ["--scenario", "nope"]).status).toBe(2);
  }, TIMEOUT);
});

describe("review-checklist.mjs", () => {
  it("prints a checklist and never fails without --strict", () => {
    const result = run("review-checklist.mjs", ["--base", "HEAD", "--json"]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.items.some((item) => item.item === "verification")).toBe(true);
  }, TIMEOUT);
});
