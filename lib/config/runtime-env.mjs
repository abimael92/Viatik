import { z } from "zod";

const emptyAsUndefined = (value) => (value === "" ? undefined : value);

function isHttpUrl(value) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function isAllowedOrigin(value) {
  const hostname = value.startsWith("*.") ? value.slice(2) : value;
  if (!hostname || hostname.includes("*") || /[\s/?#@]/.test(hostname)) return false;

  try {
    const parsed = new URL(`http://${hostname}`);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return false;
    }

    const explicitPort = hostname.match(/:(\d+)$/);
    const expectedHostname = explicitPort ? hostname.slice(0, -explicitPort[0].length) : hostname;
    if (parsed.hostname.toLowerCase() !== expectedHostname.toLowerCase()) return false;
    if (!explicitPort) return parsed.port === "";

    const port = Number(explicitPort[1]);
    return port >= 1 && port <= 65_535 && (Number(parsed.port || 80) === port);
  } catch {
    return false;
  }
}

const httpUrl = z.string().url().refine(isHttpUrl, "must use HTTP or HTTPS");
const optionalPath = z.preprocess(
  emptyAsUndefined,
  z.string().min(1).refine((value) => !value.includes("\0"), "must not contain a null byte").optional(),
);
const optionalPassword = z.preprocess(
  emptyAsUndefined,
  z.string().optional(),
);

const runtimeEnvSchema = z.object({
  CAPACITOR_SERVER_URL: z.preprocess(
    emptyAsUndefined,
    httpUrl.default("http://localhost:3000"),
  ),
  SERVER_ACTIONS_ALLOWED_ORIGINS: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .default("")
      .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean))
      .pipe(z.array(z.string().refine(isAllowedOrigin, "must be a valid host with an optional port"))),
  ),
  VIATIK_DELEGATION_FILE: optionalPath,
  VIATIK_TEST_HEALTH_FILE: optionalPath,
  VIATIK_USAGE_LOG: optionalPath,
});
const secretsToolEnvSchema = z.object({ SECRETS_PASSWORD: optionalPassword });

/**
 * Parse only Viatik-owned tool/config settings. Standalone consumers should use
 * this instead of importing env.mjs, which validates application credentials.
 *
 * @param {Record<string, string | undefined>} [source]
 */
export function parseRuntimeEnv(source = process.env) {
  return runtimeEnvSchema.parse(source);
}

/**
 * Parse the optional passphrase used only by the local secrets CLI.
 *
 * @param {Record<string, string | undefined>} [source]
 */
export function parseSecretsToolEnv(source = process.env) {
  return secretsToolEnvSchema.parse(source);
}
