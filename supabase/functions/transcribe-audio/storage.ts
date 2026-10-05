import { serviceCredentials, serviceHeaders, type EnvReader } from "../_shared/http.ts";

export const PRIVATE_AUDIO_BUCKET = "private-audio";
/** Crew voice notes. The player streams these objects, so this module never deletes from it. */
export const TRIP_MEDIA_BUCKET = "trip-media";

export type AudioBucket = typeof PRIVATE_AUDIO_BUCKET | typeof TRIP_MEDIA_BUCKET;
export type DownloadResult = { ok: true; audio: Blob } | { ok: false; errorCode: string; retryable: boolean };

function objectPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** Downloads an object with the service role. */
export async function downloadAudio(fetchImpl: typeof fetch, env: EnvReader, bucket: AudioBucket, path: string): Promise<DownloadResult> {
  const credentials = serviceCredentials(env);
  try {
    const response = await fetchImpl(`${credentials.baseUrl}/storage/v1/object/${bucket}/${objectPath(path)}`, {
      method: "GET",
      headers: serviceHeaders(credentials),
    });
    if (response.ok) return { ok: true, audio: await response.blob() };
    await response.body?.cancel().catch(() => undefined);
    // Storage answers a missing object with 400 or 404 depending on the version.
    if (response.status === 400 || response.status === 404) return { ok: false, errorCode: "audio_missing", retryable: false };
    return { ok: false, errorCode: "storage_unavailable", retryable: true };
  } catch {
    return { ok: false, errorCode: "storage_unavailable", retryable: true };
  }
}

/**
 * Deletes private dictation objects through the Storage API; SQL deletes on
 * storage.objects are blocked and would orphan the file. Missing objects count as deleted.
 */
export async function deletePrivateAudio(fetchImpl: typeof fetch, env: EnvReader, paths: string[]): Promise<boolean> {
  if (!paths.length) return true;
  const credentials = serviceCredentials(env);
  try {
    const response = await fetchImpl(`${credentials.baseUrl}/storage/v1/object/${PRIVATE_AUDIO_BUCKET}`, {
      method: "DELETE",
      headers: serviceHeaders(credentials, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: paths }),
    });
    await response.body?.cancel().catch(() => undefined);
    return response.ok;
  } catch {
    return false;
  }
}
