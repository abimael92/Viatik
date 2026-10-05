// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createTranscriber, parseTranscribeRequest } from "./transcriber.ts";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const PATH = `22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/${JOB_ID}.webm`;

const ENV: Record<string, string> = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  TRANSCRIBE_WEBHOOK_SECRET: "webhook-secret",
  OPENAI_API_KEY: "sk-test",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function claimed(overrides: Record<string, unknown> = {}) {
  return {
    claimed: true,
    job: { id: JOB_ID, storagePath: PATH, contentType: "audio/webm", durationMs: 40_000, attempts: 1, languageHint: "es", ...overrides },
  };
}

const MEDIA_ID = "55555555-5555-4555-8555-555555555555";
const MEDIA_PATH = `33333333-3333-4333-8333-333333333333/audio/${MEDIA_ID}.m4a`;

function mediaClaimed(overrides: Record<string, unknown> = {}) {
  return {
    claimed: true,
    job: {
      mediaId: MEDIA_ID,
      storagePath: MEDIA_PATH,
      contentType: "audio/mp4",
      durationMs: 15_000,
      attempts: 1,
      languageHint: "es",
      tripName: "Ruta Maya",
      destination: "Yucatán, Mexico",
      ...overrides,
    },
  };
}

function setup({
  env = ENV,
  claim = claimed() as unknown,
  mediaClaim = mediaClaimed() as unknown,
  download = () => new Response(new Blob(["voice"]), { status: 200 }),
  whisper = () => json({ text: "Hoy visitamos Chichén Itzá.", language: "spanish", duration: 40 }),
  completeResult = true,
  deleteStatus = 200,
  cleanup = [] as unknown[],
} = {}) {
  const calls: string[] = [];
  const rpcBodies: Record<string, Record<string, unknown>[]> = {};
  const logs: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const rpc = url.match(/\/rest\/v1\/rpc\/(\w+)$/)?.[1];
    if (rpc) {
      calls.push(rpc);
      (rpcBodies[rpc] ??= []).push(JSON.parse(String(init?.body)));
      if (rpc === "claim_dictation_job") return json(claim);
      if (rpc === "complete_dictation_job") return json(completeResult);
      if (rpc === "mark_dictation_audio_deleted") return json(1);
      if (rpc === "list_dictation_audio_cleanup") return json(cleanup);
      if (rpc === "claim_media_transcription") return json(mediaClaim);
      if (rpc === "complete_media_transcription") return json(completeResult);
    }
    if (url === `https://project.supabase.co/storage/v1/object/private-audio/${PATH}` && init?.method === "GET") {
      calls.push("download");
      return download();
    }
    if (url === `https://project.supabase.co/storage/v1/object/trip-media/${MEDIA_PATH}` && init?.method === "GET") {
      calls.push("download_trip_media");
      return download();
    }
    if (url.includes("/storage/v1/object/") && init?.method === "DELETE") {
      calls.push(url.endsWith("/private-audio") ? "delete" : `delete:${url}`);
      (rpcBodies.delete ??= []).push(JSON.parse(String(init.body)));
      return json([], deleteStatus);
    }
    if (url === "https://api.openai.com/v1/audio/transcriptions") {
      calls.push("whisper");
      const form = init?.body as FormData;
      (rpcBodies.whisper ??= []).push({ language: form.get("language"), prompt: form.get("prompt"), filename: (form.get("file") as File).name });
      return whisper();
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  const handler = createTranscriber({ env: (name) => env[name], fetch: fetchMock as typeof fetch, log: (entry) => logs.push(entry) });
  return { handler, calls, rpcBodies, logs, fetchMock };
}

function webhook(body: unknown = { kind: "dictation", id: JOB_ID }, secret = "webhook-secret") {
  return new Request("https://project.supabase.co/functions/v1/transcribe-audio", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-viatik-webhook-secret": secret },
    body: JSON.stringify(body),
  });
}

describe("transcribe-audio", () => {
  it("transcribes with the author's language, saves the text, then deletes the private audio", async () => {
    const { handler, calls, rpcBodies, fetchMock } = setup();

    const response = await handler(webhook());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "done", audioDeleted: true });
    expect(calls).toEqual(["claim_dictation_job", "download", "whisper", "complete_dictation_job", "delete", "mark_dictation_audio_deleted"]);
    expect(rpcBodies.claim_dictation_job[0]).toEqual({ p_job_id: JOB_ID });
    expect(rpcBodies.whisper[0]).toEqual({ language: "es", prompt: null, filename: `${JOB_ID}.webm` });
    expect(rpcBodies.complete_dictation_job[0]).toEqual({
      p_job_id: JOB_ID,
      p_status: "done",
      p_text: "Hoy visitamos Chichén Itzá.",
      p_language: "es",
      p_error_code: null,
      p_retryable: false,
    });
    expect(rpcBodies.delete[0]).toEqual({ prefixes: [PATH] });
    expect(rpcBodies.mark_dictation_audio_deleted[0]).toEqual({ p_job_ids: [JOB_ID] });
    const download = fetchMock.mock.calls.find(([url]) => String(url).includes("/storage/v1/object/private-audio/"));
    expect(new Headers(download?.[1]?.headers).get("authorization")).toBe("Bearer service-role-key");
  });

  it("accepts a Database Webhook insert payload", async () => {
    const { handler, calls } = setup();

    await handler(webhook({ type: "INSERT", table: "dictation_jobs", schema: "public", record: { id: JOB_ID }, old_record: null }));

    expect(calls[0]).toBe("claim_dictation_job");
  });

  it("rejects requests without the shared secret", async () => {
    const { handler, fetchMock } = setup();

    expect((await handler(webhook(undefined, "wrong"))).status).toBe(401);
    expect((await handler(new Request("https://x", { method: "GET" }))).status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to run when the shared secret is not configured", async () => {
    const { handler } = setup({ env: { ...ENV, TRANSCRIBE_WEBHOOK_SECRET: "" } });

    expect((await handler(webhook())).status).toBe(503);
  });

  it("rejects malformed bodies", async () => {
    const { handler } = setup();

    expect((await handler(webhook({ kind: "dictation", id: "not-a-uuid" }))).status).toBe(400);
    expect((await handler(webhook({ kind: "media", id: "not-a-uuid" }))).status).toBe(400);
    expect((await handler(webhook({ kind: "photo", id: JOB_ID }))).status).toBe(400);
  });

  it("leaves the job pending when OpenAI is not configured", async () => {
    const { handler, fetchMock } = setup({ env: { ...ENV, OPENAI_API_KEY: " " } });

    expect(await (await handler(webhook())).json()).toEqual({ status: "skipped", reason: "openai_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exits when another run already holds the job", async () => {
    const { handler, calls } = setup({ claim: { claimed: false, reason: "not_claimable" } });

    expect(await (await handler(webhook())).json()).toEqual({ status: "skipped", reason: "not_claimable" });
    expect(calls).toEqual(["claim_dictation_job"]);
  });

  it("deletes the audio right away when the daily quota skips the job", async () => {
    const { handler, calls, rpcBodies } = setup({ claim: { claimed: false, reason: "quota", storagePath: PATH } });

    expect(await (await handler(webhook())).json()).toEqual({ status: "skipped", reason: "quota" });
    expect(calls).toEqual(["claim_dictation_job", "delete", "mark_dictation_audio_deleted"]);
    expect(rpcBodies.delete[0]).toEqual({ prefixes: [PATH] });
  });

  it("keeps the audio for a retry after a transient provider failure", async () => {
    const { handler, calls, rpcBodies } = setup({ whisper: () => json({ error: {} }, 503) });

    expect(await (await handler(webhook())).json()).toEqual({ status: "failed", errorCode: "provider_unavailable" });
    expect(rpcBodies.complete_dictation_job[0]).toMatchObject({ p_status: "failed", p_error_code: "provider_unavailable", p_retryable: true, p_text: null });
    expect(calls).not.toContain("delete");
  });

  it("deletes the audio once the last attempt fails", async () => {
    const { handler, calls } = setup({ claim: claimed({ attempts: 3 }), whisper: () => json({}, 503) });

    await handler(webhook());

    expect(calls.slice(-2)).toEqual(["delete", "mark_dictation_audio_deleted"]);
  });

  it("fails permanently and deletes the audio when the format is rejected", async () => {
    const { handler, calls, rpcBodies } = setup({ whisper: () => json({}, 400) });

    await handler(webhook());

    expect(rpcBodies.complete_dictation_job[0]).toMatchObject({ p_status: "failed", p_error_code: "unsupported_format", p_retryable: false });
    expect(calls).toContain("delete");
  });

  it("records a missing object without calling OpenAI", async () => {
    const { handler, calls, rpcBodies } = setup({ download: () => json({ error: "not_found" }, 400) });

    await handler(webhook());

    expect(calls).not.toContain("whisper");
    expect(rpcBodies.complete_dictation_job[0]).toMatchObject({ p_status: "failed", p_error_code: "audio_missing", p_retryable: false });
  });

  it("rejects empty audio without calling OpenAI", async () => {
    const { handler, calls, rpcBodies } = setup({ download: () => new Response(new Blob([]), { status: 200 }) });

    await handler(webhook());

    expect(calls).not.toContain("whisper");
    expect(rpcBodies.complete_dictation_job[0]).toMatchObject({ p_error_code: "empty_audio" });
  });

  it("does not delete the audio when the transcript could not be saved", async () => {
    const { handler, calls } = setup({ completeResult: false });

    expect(await (await handler(webhook())).json()).toEqual({ status: "skipped", reason: "superseded" });
    expect(calls).not.toContain("delete");
  });

  it("reports a failed delete without marking the audio as gone", async () => {
    const { handler, calls } = setup({ deleteStatus: 500 });

    expect(await (await handler(webhook())).json()).toEqual({ status: "done", audioDeleted: false });
    expect(calls).not.toContain("mark_dictation_audio_deleted");
  });

  it("never logs the transcript text", async () => {
    const { handler, logs } = setup();

    await handler(webhook());

    expect(JSON.stringify(logs)).not.toContain("Chichén");
  });

  it("sweeps leftover private audio in one batch", async () => {
    const other = { job_id: "44444444-4444-4444-8444-444444444444", storage_path: "u/t/other.webm" };
    const { handler, rpcBodies } = setup({ cleanup: [{ job_id: JOB_ID, storage_path: PATH }, other] });

    expect(await (await handler(webhook({ kind: "sweep" }))).json()).toEqual({ status: "swept", deleted: 2 });
    expect(rpcBodies.delete[0]).toEqual({ prefixes: [PATH, other.storage_path] });
    expect(rpcBodies.mark_dictation_audio_deleted[0]).toEqual({ p_job_ids: [JOB_ID, other.job_id] });
  });

  it("returns 500 when the database is unreachable", async () => {
    const { handler, fetchMock } = setup();
    fetchMock.mockImplementationOnce(async () => new Response(null, { status: 503 }));

    expect((await handler(webhook())).status).toBe(500);
  });
});

describe("transcribe-audio voice notes", () => {
  const mediaWebhook = (body: unknown = { kind: "media", id: MEDIA_ID }) => webhook(body);

  it("transcribes from trip-media with language and trip hints, saves the transcript, and keeps the audio", async () => {
    const { handler, calls, rpcBodies, fetchMock } = setup();

    const response = await handler(mediaWebhook());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "done" });
    expect(calls).toEqual(["claim_media_transcription", "download_trip_media", "whisper", "complete_media_transcription"]);
    expect(rpcBodies.claim_media_transcription[0]).toEqual({ p_media_id: MEDIA_ID });
    expect(rpcBodies.whisper[0]).toEqual({ language: "es", prompt: "Ruta Maya, Yucatán, Mexico", filename: `${MEDIA_ID}.m4a` });
    expect(rpcBodies.complete_media_transcription[0]).toEqual({
      p_media_id: MEDIA_ID,
      p_status: "done",
      p_text: "Hoy visitamos Chichén Itzá.",
      p_language: "es",
      p_duration_seconds: 40,
      p_error_code: null,
      p_retryable: false,
    });
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });

  it("starts from a Database Webhook insert on trip_media and ignores photos", async () => {
    const audio = setup();
    await audio.handler(mediaWebhook({ type: "INSERT", table: "trip_media", schema: "public", record: { id: MEDIA_ID, kind: "audio" } }));
    expect(audio.calls[0]).toBe("claim_media_transcription");

    const photo = setup();
    const response = await photo.handler(mediaWebhook({ type: "INSERT", table: "trip_media", record: { id: MEDIA_ID, kind: "photo" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "skipped", reason: "not_audio" });
    expect(photo.fetchMock).not.toHaveBeenCalled();
  });

  it("lets Whisper detect the language when the author has no preference", async () => {
    const { handler, rpcBodies } = setup({ mediaClaim: mediaClaimed({ languageHint: null, tripName: null, destination: null }) });

    await handler(mediaWebhook());

    expect(rpcBodies.whisper[0]).toMatchObject({ language: null, prompt: null });
    expect(rpcBodies.complete_media_transcription[0]).toMatchObject({ p_language: "es" });
  });

  it("exits without calling OpenAI when the clip is not claimable or over quota", async () => {
    for (const reason of ["not_claimable", "not_audio", "quota"]) {
      const { handler, calls } = setup({ mediaClaim: { claimed: false, reason } });

      expect(await (await handler(mediaWebhook())).json()).toEqual({ status: "skipped", reason });
      expect(calls).toEqual(["claim_media_transcription"]);
    }
  });

  it("records a retryable provider failure and keeps the audio", async () => {
    const { handler, calls, rpcBodies } = setup({ whisper: () => json({ error: { message: "secret detail" } }, 503) });

    expect(await (await handler(mediaWebhook())).json()).toEqual({ status: "failed", errorCode: "provider_unavailable" });
    expect(rpcBodies.complete_media_transcription[0]).toMatchObject({
      p_status: "failed",
      p_text: null,
      p_error_code: "provider_unavailable",
      p_retryable: true,
    });
    expect(calls.some((call) => call.startsWith("delete"))).toBe(false);
  });

  it("fails permanently, still keeping the audio, on the last attempt or a rejected format", async () => {
    for (const [overrides, whisper] of [
      [{ attempts: 3 }, () => json({}, 503)],
      [{}, () => json({}, 400)],
    ] as const) {
      const { handler, calls } = setup({ mediaClaim: mediaClaimed(overrides), whisper });

      await handler(mediaWebhook());

      expect(calls.some((call) => call.startsWith("delete"))).toBe(false);
    }
  });

  it("records a missing object as a permanent failure without calling OpenAI", async () => {
    const { handler, calls, rpcBodies } = setup({ download: () => json({ error: "not_found" }, 404) });

    await handler(mediaWebhook());

    expect(calls).not.toContain("whisper");
    expect(rpcBodies.complete_media_transcription[0]).toMatchObject({ p_error_code: "audio_missing", p_retryable: false });
  });

  it("reports a superseded result when the claim was lost", async () => {
    const { handler } = setup({ completeResult: false });

    expect(await (await handler(mediaWebhook())).json()).toEqual({ status: "skipped", reason: "superseded" });
  });

  it("never logs the transcript or trip context", async () => {
    const { handler, logs } = setup();

    await handler(mediaWebhook());

    const logged = JSON.stringify(logs);
    expect(logged).not.toContain("Chichén");
    expect(logged).not.toContain("Ruta Maya");
    expect(logs[0]).toMatchObject({ event: "media_transcription", mediaId: MEDIA_ID, status: "done" });
  });
});

describe("parseTranscribeRequest", () => {
  it("accepts dictation, media, sweep, and webhook shapes only", () => {
    expect(parseTranscribeRequest({ kind: "dictation", id: JOB_ID })).toEqual({ kind: "dictation", id: JOB_ID });
    expect(parseTranscribeRequest({ kind: "media", id: MEDIA_ID })).toEqual({ kind: "media", id: MEDIA_ID });
    expect(parseTranscribeRequest({ kind: "sweep" })).toEqual({ kind: "sweep" });
    expect(parseTranscribeRequest({ type: "INSERT", table: "dictation_jobs", record: { id: JOB_ID } })).toEqual({ kind: "dictation", id: JOB_ID });
    expect(parseTranscribeRequest({ type: "INSERT", table: "trip_media", record: { id: MEDIA_ID, kind: "audio" } })).toEqual({
      kind: "media",
      id: MEDIA_ID,
    });
    expect(parseTranscribeRequest({ type: "INSERT", table: "trip_media", record: { id: MEDIA_ID, kind: "photo" } })).toEqual({
      kind: "ignored",
      reason: "not_audio",
    });
    expect(parseTranscribeRequest({ type: "UPDATE", table: "dictation_jobs", record: { id: JOB_ID } })).toBeNull();
    expect(parseTranscribeRequest({ type: "UPDATE", table: "trip_media", record: { id: MEDIA_ID, kind: "audio" } })).toBeNull();
    expect(parseTranscribeRequest(null)).toBeNull();
  });
});
