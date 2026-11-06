import { describe, expect, it } from "vitest";

import { parseRuntimeEnv, parseSecretsToolEnv } from "./runtime-env.mjs";

describe("parseRuntimeEnv", () => {
  it("keeps Viatik configuration optional and preserves current defaults", () => {
    expect(parseRuntimeEnv({})).toEqual({
      CAPACITOR_SERVER_URL: "http://localhost:3000",
      SERVER_ACTIONS_ALLOWED_ORIGINS: [],
      VIATIK_DELEGATION_FILE: undefined,
      VIATIK_TEST_HEALTH_FILE: undefined,
      VIATIK_USAGE_LOG: undefined,
    });
  });

  it("normalizes configured URLs, allowed origins, and file paths", () => {
    expect(
      parseRuntimeEnv({
        CAPACITOR_SERVER_URL: "https://mobile.example.test",
        SERVER_ACTIONS_ALLOWED_ORIGINS: "127.0.0.1:59249, *.example.test, , localhost",
        VIATIK_DELEGATION_FILE: "tmp/claims.json",
        VIATIK_TEST_HEALTH_FILE: "/tmp/test-health.json",
        VIATIK_USAGE_LOG: "tmp/usage.jsonl",
      }),
    ).toEqual({
      CAPACITOR_SERVER_URL: "https://mobile.example.test",
      SERVER_ACTIONS_ALLOWED_ORIGINS: ["127.0.0.1:59249", "*.example.test", "localhost"],
      VIATIK_DELEGATION_FILE: "tmp/claims.json",
      VIATIK_TEST_HEALTH_FILE: "/tmp/test-health.json",
      VIATIK_USAGE_LOG: "tmp/usage.jsonl",
    });
  });

  it("treats blank optional values as unset without changing defaults", () => {
    expect(
      parseRuntimeEnv({
        CAPACITOR_SERVER_URL: "",
        SERVER_ACTIONS_ALLOWED_ORIGINS: "",
        VIATIK_DELEGATION_FILE: "",
        VIATIK_TEST_HEALTH_FILE: "",
        VIATIK_USAGE_LOG: "",
      }),
    ).toEqual({
      CAPACITOR_SERVER_URL: "http://localhost:3000",
      SERVER_ACTIONS_ALLOWED_ORIGINS: [],
      VIATIK_DELEGATION_FILE: undefined,
      VIATIK_TEST_HEALTH_FILE: undefined,
      VIATIK_USAGE_LOG: undefined,
    });
  });

  it.each(["not-a-url", "ftp://mobile.example.test"])(
    "rejects a malformed Capacitor URL: %s",
    (value) => {
      expect(() => parseRuntimeEnv({ CAPACITOR_SERVER_URL: value })).toThrow();
    },
  );

  it.each(["https://example.test/path", "example.test:70000"])(
    "rejects a malformed Server Actions origin: %s",
    (value) => {
      expect(() => parseRuntimeEnv({ SERVER_ACTIONS_ALLOWED_ORIGINS: value })).toThrow();
    },
  );

  it("rejects file paths containing a null byte", () => {
    expect(() => parseRuntimeEnv({ VIATIK_USAGE_LOG: "logs\u0000usage.jsonl" })).toThrow();
  });

  it("keeps the secrets CLI passphrase optional and preserves it exactly", () => {
    expect(parseSecretsToolEnv({})).toEqual({ SECRETS_PASSWORD: undefined });
    expect(parseSecretsToolEnv({ SECRETS_PASSWORD: "" })).toEqual({ SECRETS_PASSWORD: undefined });
    expect(parseSecretsToolEnv({ SECRETS_PASSWORD: "  pass phrase  " })).toEqual({
      SECRETS_PASSWORD: "  pass phrase  ",
    });
  });
});
