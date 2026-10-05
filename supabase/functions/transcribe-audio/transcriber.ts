import { callServiceRpc, jsonResponse as respond, rejectUnlessWebhookSecret, type EnvReader } from "../_shared/http.ts";
import { deletePrivateAudio, downloadAudio, PRIVATE_AUDIO_BUCKET, TRIP_MEDIA_BUCKET, type AudioBucket } from "./storage.ts";
import { buildWhisperPrompt, normalizeLanguageHint, transcribeWithWhisper, WHISPER_MAX_BYTES, type WhisperResult } from "./whisper.ts";

export interface TranscriberDeps {
  env: EnvReader;
  fetch: typeof fetch;
  log?: (entry: Record<string, unknown>) => void;
}

/** Mirrors the attempt cap in claim_dictation_job and claim_media_transcription. */
export const MAX_ATTEMPTS = 3;
const SWEEP_BATCH = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Allow-listed job fields returned by `claim_dictation_job`. */
export interface ClaimedDictationJob {
  id: string;
  storagePath: string;
  contentType: string;
  durationMs: number;
  attempts: number;
  /** The author's `profiles.preferred_language`. */
  languageHint: string | null;
}

/** Allow-listed voice-note fields returned by `claim_media_transcription`. */
export interface ClaimedMediaJob {
  mediaId: string;
  storagePath: string;
  contentType: string;
  durationMs: number | null;
  attempts: number;
  languageHint: string | null;
  tripName: string | null;
  destination: string | null;
}

type Claim<Job> = { claimed: true; job: Job } | { claimed: false; reason: string; storagePath?: string | null };

type TranscribeRequest =
  | { kind: "dictation"; id: string }
  | { kind: "media"; id: string }
  | { kind: "sweep" }
  | { kind: "ignored"; reason: string };

/**
 * Accepts the trigger bodies `{ kind, id }`, a sweep request, or a Database Webhook
 * insert on dictation_jobs or trip_media. Photo inserts are acknowledged and ignored,
 * because a Database Webhook on trip_media cannot filter by kind.
 */
export function parseTranscribeRequest(payload: unknown): TranscribeRequest | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { kind?: unknown; id?: unknown; type?: unknown; table?: unknown; record?: { id?: unknown; kind?: unknown } };
  if (body.kind === "sweep") return { kind: "sweep" };

  let kind: "dictation" | "media" | null = null;
  let id: unknown = null;
  if (body.kind === "dictation" || body.kind === "media") {
    kind = body.kind;
    id = body.id;
  } else if (body.type === "INSERT" && body.table === "dictation_jobs") {
    kind = "dictation";
    id = body.record?.id;
  } else if (body.type === "INSERT" && body.table === "trip_media") {
    if (body.record?.kind !== "audio") return { kind: "ignored", reason: "not_audio" };
    kind = "media";
    id = body.record.id;
  }
  return kind && typeof id === "string" && UUID.test(id) ? { kind, id } : null;
}

function fileName(storagePath: string): string {
  return storagePath.split("/").pop() || "audio.webm";
}

export function createTranscriber(deps: TranscriberDeps): (request: Request) => Promise<Response> {
  const log = deps.log ?? (() => undefined);
  const rpc = <T>(name: string, args: Record<string, unknown>) => callServiceRpc<T>(deps.fetch, deps.env, name, args);

  /** Download, validate, and send to Whisper. Shared by dictation and voice notes. */
  async function transcribeObject(input: {
    apiKey: string;
    bucket: AudioBucket;
    storagePath: string;
    contentType: string;
    languageHint: string | null;
    prompt?: string | null;
  }): Promise<WhisperResult> {
    const download = await downloadAudio(deps.fetch, deps.env, input.bucket, input.storagePath);
    if (!download.ok) return download;
    if (download.audio.size === 0) return { ok: false, errorCode: "empty_audio", retryable: false };
    if (download.audio.size > WHISPER_MAX_BYTES) return { ok: false, errorCode: "too_large", retryable: false };
    return transcribeWithWhisper(deps.fetch, {
      apiKey: input.apiKey,
      audio: new Blob([download.audio], { type: input.contentType }),
      filename: fileName(input.storagePath),
      languageHint: normalizeLanguageHint(input.languageHint),
      prompt: input.prompt,
    });
  }

  /** D3: private audio leaves the bucket as soon as it is no longer needed. The sweep retries failures. */
  async function removeAudio(jobIds: string[], paths: string[]): Promise<boolean> {
    const deleted = await deletePrivateAudio(deps.fetch, deps.env, paths);
    if (deleted) await rpc("mark_dictation_audio_deleted", { p_job_ids: jobIds });
    return deleted;
  }

  async function transcribeDictation(apiKey: string, jobId: string): Promise<Response> {
    const claim = await rpc<Claim<ClaimedDictationJob>>("claim_dictation_job", { p_job_id: jobId });
    if (!claim?.claimed) {
      const reason = claim?.reason ?? "not_found";
      const audioDeleted = reason === "quota" && claim?.storagePath ? await removeAudio([jobId], [claim.storagePath]) : false;
      log({ event: "dictation_transcription", jobId, status: "skipped", reason, audioDeleted });
      return respond({ status: "skipped", reason });
    }

    const job = claim.job;
    const result = await transcribeObject({ apiKey, bucket: PRIVATE_AUDIO_BUCKET, ...job });
    const recorded = await rpc<boolean>("complete_dictation_job", {
      p_job_id: job.id,
      p_status: result.ok ? "done" : "failed",
      p_text: result.ok ? result.text : null,
      p_language: result.ok ? result.language : null,
      p_error_code: result.ok ? null : result.errorCode,
      p_retryable: result.ok ? false : result.retryable,
    });

    if (!result.ok) {
      const final = recorded === true && (!result.retryable || job.attempts >= MAX_ATTEMPTS);
      const audioDeleted = final ? await removeAudio([job.id], [job.storagePath]) : false;
      log({ event: "dictation_transcription", jobId: job.id, status: "failed", errorCode: result.errorCode, attempts: job.attempts, final, audioDeleted });
      return respond({ status: "failed", errorCode: result.errorCode });
    }
    if (recorded !== true) {
      log({ event: "dictation_transcription", jobId: job.id, status: "skipped", reason: "superseded" });
      return respond({ status: "skipped", reason: "superseded" });
    }

    const audioDeleted = await removeAudio([job.id], [job.storagePath]);
    log({
      event: "dictation_transcription",
      jobId: job.id,
      status: "done",
      attempts: job.attempts,
      durationMs: job.durationMs,
      language: result.language,
      audioDeleted,
    });
    return respond({ status: "done", audioDeleted });
  }

  /** Crew voice notes keep their audio for playback; nothing here deletes from trip-media. */
  async function transcribeMedia(apiKey: string, mediaId: string): Promise<Response> {
    const claim = await rpc<Claim<ClaimedMediaJob>>("claim_media_transcription", { p_media_id: mediaId });
    if (!claim?.claimed) {
      const reason = claim?.reason ?? "not_found";
      log({ event: "media_transcription", mediaId, status: "skipped", reason });
      return respond({ status: "skipped", reason });
    }

    const job = claim.job;
    const result = await transcribeObject({
      apiKey,
      bucket: TRIP_MEDIA_BUCKET,
      storagePath: job.storagePath,
      contentType: job.contentType,
      languageHint: job.languageHint,
      prompt: buildWhisperPrompt([job.tripName, job.destination]),
    });
    const recorded = await rpc<boolean>("complete_media_transcription", {
      p_media_id: job.mediaId,
      p_status: result.ok ? "done" : "failed",
      p_text: result.ok ? result.text : null,
      p_language: result.ok ? result.language : null,
      p_duration_seconds: result.ok ? result.durationSeconds : null,
      p_error_code: result.ok ? null : result.errorCode,
      p_retryable: result.ok ? false : result.retryable,
    });

    const status = recorded !== true ? "skipped" : result.ok ? "done" : "failed";
    log({
      event: "media_transcription",
      mediaId: job.mediaId,
      status,
      ...(recorded !== true ? { reason: "superseded" } : {}),
      ...(result.ok ? { language: result.language } : { errorCode: result.errorCode }),
      attempts: job.attempts,
      durationMs: job.durationMs,
    });
    if (status === "skipped") return respond({ status, reason: "superseded" });
    return respond(result.ok ? { status } : { status, errorCode: result.errorCode });
  }

  async function sweep(): Promise<Response> {
    const rows = (await rpc<{ job_id: string; storage_path: string }[]>("list_dictation_audio_cleanup", { p_limit: SWEEP_BATCH })) ?? [];
    if (!rows.length) return respond({ status: "swept", deleted: 0 });
    const deleted = await removeAudio(
      rows.map((row) => row.job_id),
      rows.map((row) => row.storage_path),
    );
    log({ event: "dictation_audio_sweep", candidates: rows.length, deleted });
    return respond({ status: deleted ? "swept" : "failed", deleted: deleted ? rows.length : 0 });
  }

  return async function handle(request: Request): Promise<Response> {
    const rejected = rejectUnlessWebhookSecret(request, deps.env, "TRANSCRIBE_WEBHOOK_SECRET");
    if (rejected) return rejected;

    const parsed = parseTranscribeRequest(await request.json().catch(() => null));
    if (!parsed) return respond({ status: "error" }, 400);
    if (parsed.kind === "ignored") return respond({ status: "skipped", reason: parsed.reason });

    try {
      if (parsed.kind === "sweep") return await sweep();
      const apiKey = deps.env("OPENAI_API_KEY")?.trim();
      if (!apiKey) return respond({ status: "skipped", reason: "openai_not_configured" });
      return parsed.kind === "media" ? await transcribeMedia(apiKey, parsed.id) : await transcribeDictation(apiKey, parsed.id);
    } catch (error) {
      log({
        event: `${parsed.kind}_transcription_error`,
        id: "id" in parsed ? parsed.id : null,
        error: error instanceof Error ? error.message : "unknown",
      });
      return respond({ status: "error" }, 500);
    }
  };
}
