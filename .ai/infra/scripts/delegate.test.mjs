import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TIMEOUT = 30_000;
const SCRIPT = path.join(process.cwd(), ".ai/infra/scripts/delegate.mjs");
let dir;
let stateFile;

function run(args, env = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, VIATIK_DELEGATION_FILE: stateFile, ...env },
  }, TIMEOUT);
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "viatik-delegate-"));
  stateFile = path.join(dir, "claims.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("delegate.mjs", () => {
  it("claims paths and reports them in status", () => {
    const claim = run(["claim", "--task", "A", "--agent", "one", "--files", "features/x/**,lib/db/dexie.ts"]);
    expect(claim.status).toBe(0);

    const status = run(["status"]);
    expect(status.status).toBe(0);
    expect(status.stdout).toContain("features/x/**");
  }, TIMEOUT);

  it("refuses an overlapping claim for another task", () => {
    run(["claim", "--task", "A", "--agent", "one", "--files", "features/x/**"]);
    const overlap = run(["claim", "--task", "B", "--agent", "two", "--files", "features/x/components/a.tsx"]);
    expect(overlap.status).toBe(1);
    expect(overlap.stderr).toContain("delegation overlap");
  }, TIMEOUT);

  it("allows a disjoint claim", () => {
    run(["claim", "--task", "A", "--agent", "one", "--files", "features/x/**"]);
    const disjoint = run(["claim", "--task", "B", "--agent", "two", "--files", "features/y/**"]);
    expect(disjoint.status).toBe(0);
  }, TIMEOUT);

  it("requires a reason for a takeover and records it", () => {
    run(["claim", "--task", "A", "--agent", "one", "--files", "features/x/**"]);
    const noReason = run(["claim", "--task", "B", "--agent", "two", "--files", "features/x/a.ts", "--takeover"]);
    expect(noReason.status).toBe(2);

    const takeover = run([
      "claim",
      "--task",
      "B",
      "--agent",
      "two",
      "--files",
      "features/x/a.ts",
      "--takeover",
      "--reason",
      "lead reassigned ownership",
    ]);
    expect(takeover.status).toBe(0);
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    expect(state.claims.find((claim) => claim.task === "B").reason).toBe("lead reassigned ownership");
  }, TIMEOUT);

  it("checks paths and releases a claim", () => {
    run(["claim", "--task", "A", "--agent", "one", "--files", "lib/db/dexie.ts"]);
    expect(run(["check", "--files", "lib/db/dexie.ts"]).status).toBe(1);
    expect(run(["release", "--task", "A"]).status).toBe(0);
    expect(run(["check", "--files", "lib/db/dexie.ts"]).status).toBe(0);
  }, TIMEOUT);
});
