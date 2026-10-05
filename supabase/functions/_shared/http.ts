export type EnvReader = (name: string) => string | undefined;

export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

/** Null when the shared secret is configured and matches; otherwise the response to return. */
export function rejectUnlessWebhookSecret(request: Request, env: EnvReader, secretName: string): Response | null {
  if (request.method !== "POST") return jsonResponse({ status: "error" }, 405);
  const secret = env(secretName);
  if (!secret) return jsonResponse({ status: "error" }, 503);
  if (!constantTimeEqual(request.headers.get("x-viatik-webhook-secret") ?? "", secret)) {
    return jsonResponse({ status: "error" }, 401);
  }
  return null;
}

export interface ServiceCredentials {
  baseUrl: string;
  serviceKey: string;
}

export function serviceCredentials(env: EnvReader): ServiceCredentials {
  const baseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!baseUrl || !serviceKey) throw new Error("Supabase service credentials are not configured");
  return { baseUrl: baseUrl.replace(/\/+$/, ""), serviceKey };
}

export function serviceHeaders(credentials: ServiceCredentials, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: credentials.serviceKey, Authorization: `Bearer ${credentials.serviceKey}`, ...extra };
}

/** Calls a Postgres function through PostgREST with the service role. */
export async function callServiceRpc<T>(
  fetchImpl: typeof fetch,
  env: EnvReader,
  name: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const credentials = serviceCredentials(env);
  const response = await fetchImpl(`${credentials.baseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: serviceHeaders(credentials, { "Content-Type": "application/json" }),
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`RPC ${name} failed with status ${response.status}`);
  const body = await response.text();
  return body ? (JSON.parse(body) as T) : null;
}
