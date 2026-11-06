import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const validPublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
};

function runEnvImport(
  overrides: Record<string, string> = {},
  unset: string[] = [],
  source = "await import('./env.mjs')",
) {
  const childEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "",
    NODE_ENV: "production",
    ...validPublicEnv,
    ...overrides,
  };
  for (const name of unset) delete childEnv[name];

  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", source],
    { cwd: projectRoot, env: childEnv, encoding: "utf8" },
  );

  return { ...result, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

describe("application environment startup validation", () => {
  it("accepts valid required settings and blank optional settings", () => {
    const result = runEnvImport({
      SUPABASE_SERVICE_ROLE_KEY: "",
      SMS_PROVIDER_API_KEY: "",
      GOOGLE_MAPS_API_KEY: "",
      AI_SCOUT_ENDPOINT: "",
      AI_SCOUT_API_KEY: "",
      OPENAI_API_KEY: "",
      GEMINI_API_KEY: "",
      QR_SIGNING_SECRET: "",
      TWILIO_ACCOUNT_SID: "",
      TWILIO_AUTH_TOKEN: "",
      TWILIO_WHATSAPP_FROM: "",
    });

    expect(result.status).toBe(0);
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"])(
    "fails clearly when required public setting %s is missing",
    (name) => {
      const result = runEnvImport({}, [name]);

      expect(result.status).not.toBe(0);
      expect(result.output).toContain(name);
    },
  );

  it("rejects malformed secrets without printing their values", () => {
    const secret = "qr-secret-marker";
    const result = runEnvImport({ QR_SIGNING_SECRET: secret });

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("QR_SIGNING_SECRET");
    expect(result.output).not.toContain(secret);
  });

  it("validates QR secret length in bytes", () => {
    expect(runEnvImport({ QR_SIGNING_SECRET: "é".repeat(16) }).status).toBe(0);
    expect(runEnvImport({ QR_SIGNING_SECRET: "é".repeat(15) }).status).not.toBe(0);
  });

  it("rejects a malformed provider URL at startup", () => {
    const result = runEnvImport({ AI_SCOUT_ENDPOINT: "ftp://ai.example.test" });

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("AI_SCOUT_ENDPOINT");
  });

  it("rejects unsupported values for the validation bypass switch", () => {
    const result = runEnvImport({ SKIP_ENV_VALIDATION: "yes" });

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("SKIP_ENV_VALIDATION");
    expect(result.output).not.toContain("yes");
  });

  it("does not expose server secrets through a client environment", () => {
    const secret = "service-role-secret-marker";
    const result = runEnvImport(
      { SUPABASE_SERVICE_ROLE_KEY: secret },
      [],
      "globalThis.window = {}; const { env } = await import('./env.mjs'); try { void env.SUPABASE_SERVICE_ROLE_KEY; process.exit(1); } catch { process.exit(0); }",
    );

    expect(result.status).toBe(0);
    expect(result.output).not.toContain(secret);
  });

  it("preserves the explicit validation bypass for local test tooling", () => {
    const result = runEnvImport({ SKIP_ENV_VALIDATION: "true" }, [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);

    expect(result.status).toBe(0);
  });
});
