import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildManifest } from "./context-manifest.mjs";

const TIMEOUT = 30_000;
const SCRIPT = path.join(process.cwd(), ".ai/infra/scripts/context-manifest.mjs");

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

describe("context-manifest.mjs", () => {
  it("maps a schema change to the data-model doc, the guardian and agent:schema", () => {
    const manifest = buildManifest({ files: ["lib/db/dexie.ts"] });
    expect(manifest.docs).toContain("memory/data-models.md");
    expect(manifest.skills).toContain("dexie-schema-guardian");
    expect(manifest.verify).toContain("pnpm agent:schema");
    expect(manifest.memory).toContain("memory/data-models.md");
  }, TIMEOUT);

  it("maps a UI change to i18n and the visual reviewer", () => {
    const manifest = buildManifest({ files: ["features/trips/components/trip-card.tsx"] });
    expect(manifest.skills).toContain("visual-ui-reviewer");
    expect(manifest.skills).toContain("i18n-checker");
    expect(manifest.verify).toContain("pnpm agent:audit-i18n");
  }, TIMEOUT);

  it("does not guess a test plan for an explicit file list", () => {
    const manifest = buildManifest({ files: ["lib/db/dexie.ts"], impact: true, explicit: true });
    expect(manifest.impact.tests).toBeNull();
  }, TIMEOUT);

  it("always includes the entry-point documents", () => {
    const manifest = buildManifest({ files: [] });
    expect(manifest.docs).toContain("AGENTS.md");
    expect(manifest.docs).toContain(".ai/constitution.md");
  }, TIMEOUT);

  it("exits 0 for a valid file list", () => {
    const result = run(["--files", "lib/sync/outbox.ts", "--json"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).rules).toContain("sync-engine");
  }, TIMEOUT);
});
