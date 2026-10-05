# Feature Specification: Audio Notes & Transcription

**Project:** Viatik  
**Owner:** Viatik Engineering  
**Status:** Ready for Design  
**Created:** 2026-09-28  
**Updated:** 2026-09-28  
**Related work:** [trip-wrap-up.md](./trip-wrap-up.md), [bug-settlement-notification-trigger.md](./bug-settlement-notification-trigger.md), Quick Notes (`supabase/migrations/00000000000068_trip_notes.sql`), trip media pipeline (`lib/sync/cloud-sync.ts` `processPendingMedia`)

> Read [`../constitution.md`](../constitution.md) and [`../AGENTS.md`](../AGENTS.md) before implementing. This spec was written during a hard code freeze. No code, migration, or native configuration changes accompany it.

## What & Why

### What

Travelers can record audio on their device, even offline, in two places:

1. **Voice notes (Quick Notes).** A shared trip note that carries an audio clip. After upload, the server transcribes it with OpenAI `whisper-1`. The crew sees an audio player and a read-only transcript.
2. **Journal dictation (Trip Journal).** A private clip that is only a way to type faster. The server transcribes it and appends the text once to the traveler's local journal entry for that day. The server then deletes the audio and clears the transcript. The journal stays local-only.

### Why

Typing on a phone while walking, on a bus, or at the end of a long day is slow. Voice capture must work offline, because the field test runs on unreliable networks. Transcripts make voice notes searchable and readable without playback.

### Decisions (2026-09-28, Viatik Product)

| # | Decision |
|---|---|
| D1 | Journal is **dictation only** (Option A). It stays in Dexie. There is no journal table or journal sync. |
| D2 | **Viewers can record voice notes**, matching `trip_notes` permissions. Photo uploads stay editor-only. |
| D3 | Private journal audio is **deleted from `private-audio` as soon as it is transcribed**. |
| D4 | Transcripts are **read-only in v1**. To correct one, the traveler types a new note or deletes the voice note. |
| D5 | Model is **`whisper-1`** ($0.006/min). `gpt-4o-mini-transcribe` may be evaluated later. |

### Users and scenarios

- **Primary user:** A trip member (owner, editor, or viewer) on an active trip, often offline.
- **Scenario 1 (voice note, offline):**
  - *Given* a traveler with no connection.
  - *When* they tap the mic in Quick Notes, speak, and tap Stop.
  - *Then* the note appears immediately with local playback and the status "Saved on this device". Once online, it uploads and shows "Transcribing…". Then the transcript appears for every crew member.
- **Scenario 2 (voice note, crew):**
  - *Given* a crew member's device pulls a voice note.
  - *When* the transcript is done.
  - *Then* the note shows an audio player and the transcript, updated through realtime without a reload.
- **Scenario 3 (journal dictation):**
  - *Given* a traveler editing today's journal entry.
  - *When* they tap Dictate and record 40 seconds.
  - *Then* a "Transcribing 0:40…" chip appears. When the text arrives, it is appended once to that day's text, and the server keeps neither the audio nor the transcript.
- **Scenario 4 (bad transcript):**
  - *Given* a voice note with a wrong transcript.
  - *Then* the transcript cannot be edited. The traveler can type a correction as a new note, or delete the voice note.
- **Offline or degraded-network behavior:** Capture, local playback, and local persistence need no network. Upload, transcription, and crew playback of another member's clip need a connection. A clip recorded offline is never lost because of retries.

## In Scope

- Browser audio capture with `MediaRecorder`: format negotiation, mono at 24–32 kbps, crash-safe chunking, duration caps.
- Dexie v43 for local audio. It adds new `tripMedia` fields, the note's audio reference, draft chunks, transcripts, and dictation clips.
- Upload of voice-note audio to `trip-media` through the existing media pipeline, separate from the JSON outbox.
- Upload of dictation audio to a new private bucket, `private-audio`.
- Additive Postgres changes: new columns on `trip_media` and `trip_notes`, new tables `media_transcripts` and `dictation_jobs`, storage bucket and policy updates, realtime publication entries.
- An Edge Function, `transcribe-audio`, started by a database trigger and webhook, with a `pg_cron` sweep as a backstop.
- Sync-engine fixes needed for binary data: blockers B2–B7 below.
- UI: record controls in Quick Notes and the Journal editor, playback, transcript states, and copy in Spanish and English.
- Per-user and per-trip transcription quotas, and redacted observability.
- A follow-up migration that records the `trip_notes` and `trip_tasks` realtime publication change already applied by hand in production (see Phase 0).

## Out of Scope

- Syncing journals or sharing journal entries (D1).
- Editing transcripts (D4).
- Summarizing, translating, or searching transcripts.
- Resumable (TUS) uploads. Bitrate and duration caps keep clips under 6 MB.
- On-device `SpeechRecognition` as a dictation engine. It may be a later progressive enhancement.
- Audio on activities, expenses, or the shared feed.
- Evaluating `gpt-4o-mini-transcribe` (D5 follow-up).
- The WhatsApp notification engine.

## Current State and Blockers

These findings came from a read-only review on 2026-09-28. Each blocker must be resolved in the phase shown in the Implementation Plan.

| # | Blocker | Location | Resolution |
|---|---|---|---|
| B1 | The `trip-media` bucket allows only `image/jpeg, png, webp, heic`, up to 10 MB. | migration 08 | Add `audio/webm`, `audio/mp4`, `audio/ogg`, and `audio/mpeg`. Keep 10 MB. |
| B2 | `syncOnce` replays outbox mutations before `processPendingMedia`. A note would reach Postgres before its media row. | `lib/sync/sync-engine.ts` | The note mutation is deferred until its media is `uploaded`, without counting an attempt. |
| B3 | Trip-media uploads stopped after 5 attempts, and `retryFailedMutations()` reset outbox rows only, so audio could be stranded. | `lib/sync/cloud-sync.ts`, `lib/sync/outbox.ts` | Media uploads now retry with capped exponential backoff, and explicit retry clears the media attempt count, error, and retry deadline. Apply equivalent reset behavior to dictation clips when that pipeline is implemented. |
| B4 | `rowToMedia` sets `blob: null`, and `applyRemote` overwrites the local row. The author loses offline playback after the row syncs back. | `lib/supabase/mappers.ts`, `applyRemote` | Keep the local `blob` when `kind === "audio"`. |
| B5 | `processPendingMedia` uploads one file at a time inside the exclusive sync lock, as one non-resumable request. | `lib/sync/cloud-sync.ts` | Cap each sync pass at about 20 s or 8 MB of uploads, then yield to the next pass. |
| B6 | `processPendingMedia` returns early when `navigator.onLine` is false, although `syncOnce` documents that flag as unreliable. | `lib/sync/cloud-sync.ts:407` | Remove the early return. Rely on request failure and backoff. |
| B7 | Media code assumes images: the extension and content-type fallback, the `uploaded_photo` feed event, and gallery queries. | `features/media/data/dexie-media-repository.ts`, gallery | Branch by `kind`. Gallery and feed show `kind === "photo"` only. |
| B8 | `trip_notes` is member-writable, but `trip_media` and storage writes are editor-only. | migrations 08, 68 | Add member policies limited to `kind = 'audio'` and the `audio/` folder (D2). |
| B9 | `trip_notes.content` must be 1–280 non-blank characters. | migration 68 | Relax the check when `audio_media_id` is set. |
| B10 | `trip_notes` and `trip_tasks` were not in `supabase_realtime`. | migrations 68, 69 | **Fixed by hand in production on 2026-09-28.** A repository migration must record it (Phase 0). |
| B11 | The iOS app has no `NSMicrophoneUsageDescription`. | `ios/App` | Add the key before any recording UI ships in the native build. Frozen for now. |
| B12 | The repo has no Edge Functions, `pg_net` webhooks, or `pg_cron` jobs. | repo | Built in Phase 3. |

## Constraints and Design

### Architecture boundaries

- **The JSON outbox never carries binary data.** Blobs live only in `tripMedia.blob` and `dictationClips.blob`. Outbox payloads carry ids.
- **Voice notes reuse the media side channel.** They extend `tripMedia` and `trip_media` and `processPendingMedia`. There is no separate `local_media` table. The existing pipeline already provides:
  - blob isolation from the outbox;
  - upload status and backoff;
  - signed-URL refresh;
  - delete propagation;
  - storage RLS by trip folder.
- **Dictation has its own path** (`dictationClips` → `private-audio` → `dictation_jobs`). The `trip_media` select policy is open to every trip member, so private clips must never create `trip_media` rows.
- **UI components never call Supabase.** Recording writes through repositories: `mediaRepository`, `tripNoteRepository`, and a new `dictationRepository`. Transcripts arrive through pull and realtime into Dexie.
- **The server alone writes transcripts.** Clients have no insert or update policy on `media_transcripts` or `dictation_jobs` text columns.

### Capture (client)

- **Format negotiation.** Try these in order with `MediaRecorder.isTypeSupported`:
  1. `audio/webm;codecs=opus`
  2. `audio/mp4`
  3. `audio/ogg;codecs=opus`

  Store and upload the base MIME type without `;codecs`. The extension follows the type: `webm`, `m4a`, or `ogg`.
- **Microphone settings.** Use `getUserMedia` with `channelCount: 1`, `echoCancellation`, and `noiseSuppression`. Set `audioBitsPerSecond` to 24–32 kbps.
- **Duration caps.** Recording stops automatically at 120 s for voice notes and 600 s for dictation. A countdown appears in the last 10 s.
- **Crash safety.** A 1 s timeslice writes chunks to `recordingDrafts`. On stop, the chunks are joined into one Blob in a single transaction, then deleted. On app start, orphan drafts older than 24 h are offered for recovery or discarded.
- **Cleanup.** Microphone tracks stop on stop, cancel, unmount, and `pagehide`. Object URLs are revoked on unmount.
- **Storage.** Call `navigator.storage.persist()` on first recording. Before recording, if `navigator.storage.estimate()` shows under 50 MB free, warn and still allow the recording.
- **Secure context.** Recording needs HTTPS or localhost. When unavailable, the mic control is hidden rather than shown and then failing.

### Local data (Dexie v43–v44)

v43 is additive. It must not modify v39–v42.

| Table | Change |
|---|---|
| `tripMedia` | Add `kind: "photo" \| "audio"` (backfill `"photo"`) and `durationMs: number \| null` (backfill `null`). Add a `kind` index. |
| `tripNotes` | Add `audioMediaId: string \| null` (backfill `null`). |
| `recordingDrafts` (new) | `id` = `[draftId+seq]`, `draftId`, `seq`, `chunk: Blob`, `mimeType`, `createdAt`. Local only. |
| `mediaTranscripts` (new) | Pull-only mirror of `media_transcripts`, keyed by `mediaId`. |
| `dictationClips` (new) | `id`, `tripId`, `dayDate`, `blob`, `contentType`, `durationMs`, `status` (`pending`, `uploading`, `uploaded`, `transcribing`, `done`, `failed`), `uploadAttempts`, `nextUploadAt`, `transcript: string \| null`, `error: string \| null`, `createdAt`. Local only. |
| `journalDayEntries` | Add `consumedDictationIds: string[]` (backfill `[]`), so a transcript is appended at most once. |

### Sync flow

**Voice note.**

1. **Offline.** One Dexie transaction writes two rows:
   - a `tripMedia` audio row: `kind: "audio"`, `pending`, the blob, and path `{tripId}/audio/{mediaId}.{ext}`;
   - a `tripNotes` row with `audioMediaId`, plus its normal outbox `insert`.
2. **Online, media.** `processPendingMedia` uploads the blob, inserts `trip_media` through `sync_cas_upsert('media')`, and marks the row `uploaded`. It keeps the local blob (B4).
3. **Online, note.** The note's outbox mutation waits while its `audioMediaId` media is not `uploaded` (B2). Waiting never increments `attempts`. It follows the existing `requeueMissingExpenseParent` and `mutationDependencyRank` patterns.
4. **Server.** The `trip_media` insert of an audio row starts transcription.
5. **Crew devices.** They pull `trip_notes`, `trip_media`, and `media_transcripts`. Playback uses the refreshed signed URL. Offline without a local blob, they show "Available when online" and still show the transcript if it synced.

**Dictation.**

1. **Offline.** A `dictationClips` row is written with the blob, `tripId`, and `dayDate`.
2. **Online.** The same sync pass, after voice-note media and within the B5 budget, performs these steps:
   1. uploads to `private-audio/{userId}/{tripId}/{clipId}.{ext}`;
   2. inserts `dictation_jobs` through a narrow RPC;
   3. sets the clip to `transcribing`.
3. **Server.** The Edge Function writes `text` to the job row.
4. **Client.** The client pulls its own jobs. When a job is `done`, it appends the text to `journalDayEntries[tripId:dayDate]` and records the clip id in `consumedDictationIds`, in one transaction. It then calls `ack_dictation_job(id)` and deletes the local clip blob.
5. **Server.** `ack_dictation_job` sets `text = null` and `status = 'consumed'`. The server never keeps journal text after the device has it (D1, D3).

### Remote schema

All changes are additive and follow the Tiered Metadata Strategy: `created_at`, `updated_at`, `version`, and actor columns. Money is not involved.

**`trip_media`**
- Add `kind text not null default 'photo' check (kind in ('photo','audio'))`.
- Add `duration_ms integer null check (duration_ms between 0 and 600000)`.
- Check that `kind = 'audio'` implies `content_type like 'audio/%'`.
- Policies for D2, additive and limited to audio:
  - insert when `kind = 'audio' and is_trip_member(trip_id) and created_by = auth.uid()`;
  - update or delete when `kind = 'audio' and created_by = auth.uid()`, so a viewer can delete their own voice note.
- The editor-only policies stay unchanged.
- `sync_cas_upsert('media')` accepts `kind` and `duration_ms`.

**`trip_notes`**
- Add `audio_media_id uuid null references public.trip_media (id) on delete set null`.
- Replace the content check with: `char_length(trim(content)) between 1 and 280` **or** `(audio_media_id is not null and char_length(content) <= 280)`. `content` may be `''` for a voice-only note.
- `sync_trip_note_cas_upsert` sets `audio_media_id` on insert only. It never changes it on update.
- There is no transcript column. Server writes to `trip_notes` would bump `updated_at` and discard offline edits through the CAS conflict path.

**`media_transcripts` (new, crew voice notes only)**
- **Columns:**
  - `media_id uuid primary key references trip_media on delete cascade`
  - `trip_id uuid not null`
  - `owner_id uuid not null`
  - `status text not null check (status in ('pending','processing','done','failed','skipped'))`
  - `text text null check (char_length(text) <= 20000)`
  - `language text null`
  - `duration_seconds numeric null`
  - `attempts int not null default 0`
  - `error_code text null`
  - `created_at`, `updated_at`, `version`
- **RLS:** `select` when `is_trip_member(trip_id)`. There are no client insert, update, or delete policies.
- **Realtime:** added to `supabase_realtime`.

**`dictation_jobs` (new, private)**
- **Columns:**
  - `id uuid primary key` (the local clip id)
  - `owner_id uuid not null`
  - `trip_id uuid not null`
  - `storage_path text not null`
  - `content_type`, `duration_ms`
  - `status` (`pending`, `processing`, `done`, `failed`, `skipped`, `consumed`)
  - `text text null`, `language`
  - `attempts`, `error_code`
  - `created_at`, `updated_at`, `version`
- **RLS:** `select` when `owner_id = auth.uid()`. There are no direct client writes.
- **Client RPCs**, both `security definer` and both checking `owner_id = auth.uid()`:
  - `create_dictation_job(p_id, p_trip_id, p_storage_path, p_content_type, p_duration_ms)` requires `is_trip_member(p_trip_id)` and a path prefix of `auth.uid()/p_trip_id/`;
  - `ack_dictation_job(p_id)` clears `text`.
- **Realtime:** added to `supabase_realtime`. Row-level security limits delivery to the owner.

**Storage**
- `trip-media`: extend `allowed_mime_types` as in B1. Add a member insert policy: first folder is a trip where `is_trip_member`, second folder is `'audio'`, and `owner = auth.uid()`. Add an owner-or-editor delete policy for the `audio/` folder.
- `private-audio` (new, private, 10 MB, audio types only). All of select, insert, and delete are owner-only: `(storage.foldername(name))[1] = auth.uid()::text`. The service role deletes after transcription (D3).

**Realtime publication**
- A Phase 0 migration adds `trip_notes` and `trip_tasks` if missing. It uses the idempotent `pg_publication_tables` guard from migration 63, so it matches the manual production fix.
- Phase 3 adds `media_transcripts` and `dictation_jobs` the same way.

### Transcription pipeline (server)

- **Voice-note trigger.** An `after insert` trigger on `trip_media` where `kind = 'audio'` does two things in one transaction:
  - inserts a `media_transcripts` row with status `pending`;
  - calls `pg_net` to POST `{ "kind": "media", "id": media_id }` to `transcribe-audio`.
- **Dictation trigger.** An `after insert` trigger on `dictation_jobs` POSTs `{ "kind": "dictation", "id": id }`.
- **Backstop.** A `pg_cron` job every 5 minutes re-sends two kinds of job: rows `pending` for more than 2 minutes, and rows `failed` with `attempts < 3`. Webhooks alone are fire-and-forget.
- **Edge Function `transcribe-audio`.**
  1. **Authenticate.** Reject requests without the shared secret header (`TRANSCRIBE_WEBHOOK_SECRET`). The function is not callable from browsers.
  2. **Claim atomically.** Run `update … set status = 'processing', attempts = attempts + 1 where id = $1 and status in ('pending','failed') returning *`. If no row returns, exit; another run has the job.
  3. **Validate.** The content type must be audio, the size at most 25 MB, and the duration within the cap. Otherwise set `failed` with `error_code = 'too_long'` or `'unsupported_format'`.
  4. **Check quota.** The limit is 60 transcribed minutes per trip per day and 30 per user per day. Over the limit, set `skipped` with `error_code = 'quota'`. There is no automatic retry for `skipped`.
  5. **Download** the object with the service-role client.
  6. **Transcribe.** POST to OpenAI `audio/transcriptions` with `model = whisper-1` and the language hint from the author's `profiles.preferred_language` (`es` or `en`). `OPENAI_API_KEY` is a Supabase secret.
  7. **Write the result.** Set `status = 'done'`, `text`, `language`, and `duration_seconds`, and bump `updated_at` and `version`.
  8. **Dictation cleanup.** After `done`, delete the `private-audio` object (D3). If the delete fails, log it; the daily sweep retries.
  9. **Errors.** Set `status = 'failed'` with a short `error_code`. Never store provider error bodies.
- **Retention sweeps (daily `pg_cron`).**
  - Delete `private-audio` objects whose job is `done`, `consumed`, `skipped`, or `failed` with `attempts >= 3`.
  - Clear `dictation_jobs.text` older than 7 days even if not acknowledged.
  - Delete `dictation_jobs` rows 30 days after `consumed`.

### UI and UX

- **Recording controls.**
  - Tap to start and tap to stop is the main interaction. Press-and-hold is optional and never the only path.
  - Quick Notes: a mic button beside the note input.
  - Journal: a "Dictate" button in the day editor.
- **While recording.** A recording bar shows a live timer, an input-level meter, a countdown near the cap, **Cancel** (discard, with confirmation if longer than 5 s), and **Stop** (save).
- **Voice-note status line** (`aria-live="polite"`):

  | State | English | Spanish |
  |---|---|---|
  | Local, not uploaded | Saved on this device | Guardado en este dispositivo |
  | Uploading | Uploading… | Subiendo… |
  | Transcript `pending` or `processing` | Transcribing… | Transcribiendo… |
  | Transcript `done` | *(transcript)*, labelled "Auto-transcribed · ES" | "Transcripción automática · ES" |
  | `failed` | Transcript unavailable | Transcripción no disponible |
  | `skipped` (quota) | Daily transcription limit reached | Límite diario de transcripción alcanzado |
  | Offline, no local blob | Available when online | Disponible con conexión |

  While transcribing, a shimmer placeholder takes the place of the text. The transcript is hidden behind a "Show transcript" / "Hide transcript" toggle (`aria-expanded`, `aria-controls`) that expands a collapsible panel; collapsed content is `inert`. Before Phase 3 lands, the panel says "No transcript yet". It is **read-only** (D4). There is no retry control in v1; failed and skipped states are final.
- **Player.** A custom player (`VoiceNotePlayer`) drives a hidden `<audio>` element; the native `controls` UI is not used. Controls: play/pause toggle, stop (rewind to 0:00), a 1x → 1.5x → 2x speed button, and a range scrubber with `current / total`. The total comes from `tripMedia.durationMs` because MediaRecorder WebM files report `duration` as Infinity. Starting one clip pauses any other. The source is an object URL from the local blob when present (`preload="metadata"`), otherwise the signed URL (`preload="none"`).
- **Recorder.** Recording can be paused and resumed; paused time does not count toward the 120 s cap or the stored duration. The bar shows a pulsing red dot (amber and still while paused), a `00:15 / 02:00` timer, discard, pause/resume, and stop-and-save.
- **List.** Voice notes are a vertical list of cards showing the recorded-at time and duration; text notes stay as horizontal chips.
- **Deleting a voice note.** Deleting soft-deletes the note and its `trip_media` audio row, which removes the storage object through the existing media delete path.
- **Journal chips.** Each clip shows a chip: "Transcribing 0:40…", then "Added to today's entry", or "Couldn't transcribe", which keeps the local audio for a manual retry.
- **Appending text.** Text is appended on a new paragraph at the end of that day's entry. If the editor has focus, it waits for blur so typing is never interrupted. The appended text is highlighted briefly (reduced-motion aware).
- **Consent.** On first use of either recorder, one line says: "Audio is sent to our transcription provider (OpenAI) and deleted from our servers after processing for journal dictation." A link goes to the privacy notes.
- **Microphone permission.** If permission is denied, explain how to enable the microphone. Do not retry `getUserMedia` in a loop.

### Security requirements

- Enforcement is server-side only: RLS on tables and storage, `security definer` RPCs with owner and membership checks, and the webhook secret. Client checks are for UX only.
- Private clips never touch `trip_media`, the `trip-media` bucket, or `media_transcripts`.
- Logs contain ids, durations, statuses, and error codes only. They never contain transcript text, signed URLs, or audio.
- The Edge Function uses the service role only inside the function. `OPENAI_API_KEY` and `TRANSCRIBE_WEBHOOK_SECRET` are Supabase secrets and never reach the client or the repo.
- Transcripts render as plain text. There is no HTML or Markdown rendering.
- Payload limits are enforced by the bucket (10 MB), the CHECK constraints (duration, text length), and the function (25 MB, duration).

### Compatibility

- **Browsers.** Chrome and Edge (webm/opus); Safari 14.1+ and the iOS WebView (mp4/AAC); Firefox (webm or ogg/opus). If `MediaRecorder` is missing, hide the mic.
- **Native iOS.** Requires `NSMicrophoneUsageDescription` (B11). Recording stays hidden in the native build until the key ships.
- **Whisper formats** accepted: webm, mp4/m4a, ogg, mpeg.

### SOLID and design decisions

- `AudioRecorder` owns only capture: format negotiation, chunks, caps, and track cleanup. It returns a Blob and metadata. It knows nothing about notes or journals.
- `mediaRepository.createAudio` and `dictationRepository.create` own persistence. `tripNoteRepository.createVoiceNote` composes media and note in one Dexie transaction.
- A shared blob-upload helper runs uploads with backoff and the per-pass budget. `processPendingMedia` and the dictation processor both depend on it.
- Transcript display depends on the read-only `mediaTranscripts` and `dictationClips` views, never on Supabase.

### Migration and rollback plan

- **Postgres.** Additive migrations only, in order:
  1. Phase 0: the publication record.
  2. Phase 2: `trip_media` and `trip_notes` columns and policies, and the bucket MIME list.
  3. Phase 3: `media_transcripts`, `dictation_jobs`, the RPCs, `private-audio`, the triggers, and cron.
- **Rollback.** Turn off the client feature flag and unschedule the cron jobs. The new columns and tables are ignored by older clients: `OPTIONAL_REMOTE_TABLES` covers the new tables, and older mappers drop unknown columns. The relaxed `trip_notes` check stays, because voice notes may already exist.
- **Dexie.** v43 only backfills defaults. Older clients ignore the extra fields.

### Observability

- **Client debug logs:** upload attempt and outcome, dictation append, with ids only.
- **Edge Function logs:** job id, kind, status transitions, duration, latency, and `error_code`.
- **Weekly query:** minutes transcribed per trip, failure rate by `error_code`, and median upload-to-done latency.
- **Alert:** failed jobs above 10% in 1 h, or `pending` jobs older than 15 minutes.

The Architect Agent must review this section before implementation. Decision record: product decisions D1–D5 above, 2026-09-28.

## Acceptance Criteria

### Functional

- [ ] Offline, recording a voice note creates the `tripMedia` audio row and the `tripNotes` row in one transaction. The note plays back locally at once.
- [ ] No `outboxMutations` row ever contains a `Blob` or base64 audio.
- [ ] Online, the audio uploads before the note mutation is applied remotely. The note is never sent while its media is not `uploaded`, and waiting never counts as an attempt.
- [ ] After upload, the author's local blob is kept, and offline playback still works after the remote echo.
- [ ] Crew devices show "Transcribing…" and then the transcript without a reload.
- [ ] A voice note with empty `content` is accepted remotely. A text-only note keeps the 1–280 character rule.
- [ ] Voice notes stop automatically at 120 s. Dictation stops at 600 s.
- [ ] A completed dictation transcript is appended exactly once to the matching `journalDayEntries` day, even after a reload or duplicate realtime events.
- [ ] Gallery and feed never show audio rows.
- [ ] Transcripts cannot be edited in the UI (D4).

### Authorization and security

- [ ] A viewer can record, upload, and delete their own voice note (D2).
- [ ] A viewer cannot upload photos, and cannot delete another member's audio.
- [ ] A non-member cannot read `trip_media` audio rows, `trip-media/*/audio/*` objects, or `media_transcripts` rows. This is checked with crafted requests.
- [ ] Only the owner can read a `dictation_jobs` row or a `private-audio` object. Other trip members cannot.
- [ ] Clients cannot insert or update `media_transcripts`, or write `dictation_jobs.text`.
- [ ] `transcribe-audio` rejects requests without the correct secret.
- [ ] After a dictation reaches `done`, its `private-audio` object is gone (D3). After ack, `dictation_jobs.text` is `null`.
- [ ] No transcript text, audio, or signed URL appears in client or function logs.

### Reliability and offline behavior

- [ ] A tab crash during recording loses at most about 1 s of audio, and the draft can be recovered on the next start.
- [x] A trip-media clip that fails upload continues retrying beyond five attempts until it succeeds. Automatic backoff continues, and manual retry resets its attempts, error, and retry deadline (B3). Dictation retry reset remains required when that pipeline is implemented.
- [ ] A slow upload does not hold other outbox mutations longer than the per-pass budget (B5).
- [ ] Duplicate webhook deliveries produce one transcription. The claim is atomic.
- [ ] A lost webhook is recovered by the cron sweep within 10 minutes.
- [ ] Over quota, the job ends as `skipped`, the UI says so, and there is no retry loop.

### Accessibility and UX

- [ ] Start, stop, cancel, and play work with keyboard and touch. Press-and-hold is never the only path.
- [ ] Recording state and transcript status changes are announced through `aria-live`.
- [ ] The timer and level meter have text equivalents. Motion respects `prefers-reduced-motion`.
- [ ] All new copy exists in English and Spanish.
- [ ] Controls meet the 44 px touch target and contrast tokens in `specs/design-system.md`.

### Verification

- [ ] Unit tests: format negotiation, chunk assembly, caps, v43 backfill, note–media transaction, dependency deferral, blob retention in `applyRemote`, one-time journal append.
- [ ] Integration tests: the upload pass budget, retry reset, and pull/realtime of `media_transcripts` and `dictation_jobs`.
- [ ] Migration contract tests in `supabase/*.test.ts`, following the repo pattern:
  - policy text, the check constraints, and no `drop`;
  - the publication guard;
  - no transcript column on `trip_notes`.
- [ ] Edge Function tests: auth rejection, atomic claim, quota, oversized input, dictation delete, and error redaction, with OpenAI mocked.
- [ ] End-to-end test: record offline, go online, see the transcript (Playwright with a fake audio device).
- [ ] Coverage of at least 90% on changed and critical code.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- [ ] QA Agent report attached.
- [ ] Security Agent review attached. It is required: storage, RLS, a third-party processor, and secrets are involved.

## Implementation Plan

Nothing starts until the code freeze lifts, except where noted.

0. **Phase 0 (after the freeze, before any audio work).**
   - An idempotent migration records the `trip_notes` and `trip_tasks` publication membership already applied in production (B10).
   - Add `NSMicrophoneUsageDescription` (B11).
   - Architect review of this spec.
1. **Phase 1: local capture, behind a feature flag.**
   - Write failing tests for `AudioRecorder`, v43, and the voice-note transaction.
   - Implement the recorder, `recordingDrafts`, the `tripMedia` `kind` and `durationMs` fields, `tripNotes.audioMediaId`, and local playback.
   - Add the gallery and feed filters (B7). Nothing uploads.
2. **Phase 2: upload and sync.**
   - Write failing tests for deferral (B2), retry reset (B3), blob retention (B4), and the pass budget (B5).
   - Migration: `trip_media` columns and audio policies, `trip_notes` column and check, CAS updates, bucket MIME types (B1, B8, B9).
   - Engine changes, and removal of the `navigator.onLine` early return (B6).
3. **Phase 3: transcription backend.**
   - Migration: `media_transcripts`, `dictation_jobs`, the RPCs, `private-audio` and its policies, the triggers, `pg_net`, `pg_cron`, and the publication entries.
   - Edge Function `transcribe-audio` with tests, and the secrets.
   - Dexie `mediaTranscripts`, and pull/realtime wiring through `tableDefinitions` and `OPTIONAL_REMOTE_TABLES`.
4. **Phase 4: UI.**
   - Voice-note status line and transcript.
   - Journal Dictate, chips, and the one-time append with ack.
   - Consent line and i18n copy.
5. **Phase 5: hardening.**
   - Storage persistence and warnings, retention sweeps, the metrics query and alerts.
   - Browser pass on the native iOS app, Android Chrome, and desktop Safari.
   - QA and Security reviews.

## Success Metrics

| Metric | Baseline | Target | Measurement method | Owner |
|---|---:|---:|---|---|
| Voice notes uploaded within 5 min of connectivity | N/A | ≥ 95% | `trip_media.created_at` minus local `createdAt` | Engineering |
| Transcripts `done` within 60 s of upload | N/A | ≥ 90% | `media_transcripts.updated_at - created_at` | Engineering |
| Transcription failure rate (excluding quota) | N/A | < 3% | `media_transcripts` and `dictation_jobs` by `error_code` | Engineering |
| Clips lost before upload | N/A | 0 | Field-test reports and orphan `recordingDrafts` telemetry | QA |
| Private audio objects older than 24 h | N/A | 0 | Daily count of `private-audio` objects | Security |
| Transcription cost per active trip-day | N/A | ≤ $0.40 | Minutes × $0.006 | Product |

## Risks and Open Questions

- **Risk: schema drift from the manual B10 fix.** The production publication change is not in a migration, so `supabase db reset` and new environments won't have it. *Mitigation:* the Phase 0 idempotent migration.
- **Risk: the browser clears IndexedDB before upload** (Safari's 7-day rule or low storage). *Mitigation:* `storage.persist()`, the low-space warning, an "unsynced audio" indicator, and uploads as soon as connectivity returns.
- **Risk: a server write discards offline edits.** *Mitigation:* transcripts live in `media_transcripts` and `dictation_jobs`, never on `trip_notes`.
- **Risk: private audio exposed to the crew.** *Mitigation:* a separate `dictationClips` → `private-audio` → `dictation_jobs` path with owner-only RLS, deletion after transcription, and text cleared on ack.
- **Risk: cost or abuse.** *Mitigation:* duration caps, per-trip and per-user daily quotas, atomic claim, and no retry for `skipped`.
- **Risk: third-party processing.** OpenAI receives audio and may retain API data for up to 30 days. It does not train on API data by default. *Mitigation:* the consent line, the privacy notes, and a server that keeps no dictation audio.
- **Risk: iOS native crash without the microphone key.** *Mitigation:* recording stays hidden in the native build until B11 ships.
- **Risk: transcription quality with accents or noise.** *Mitigation:* the language hint, noise suppression, the "Auto-transcribed" label, and correction by a new note (D4).
- **Risk: `pg_net` and `pg_cron` availability.** Extensions must be enabled on the project. *Mitigation:* confirm before Phase 3.
- **Resolved (2026-10-05):** The language hint comes from the author's `preferred_language` (see Phase 3 Implementation Decisions).
- **Question:** Are 60 minutes per trip per day and 30 per user per day the right quotas for the field test cohort? *Owner:* Viatik Product. *Deadline:* before Phase 3.
- **Question:** Should crew voice-note audio (`trip-media/*/audio/*`) have a retention limit, for example deletion 90 days after trip completion? *Owner:* Viatik Product. *Deadline:* before Phase 5.

## Phase 1–2 Implementation Decisions (2026-10-05)

The freeze was cancelled and Viatik Product asked for Phase 1 (local capture) and Phase 2 (upload and sync). Phase 3 (transcription) is not started. These decisions supersede earlier sections where they differ.

- **Included:** Dexie v43 (`tripMedia.kind`, `tripMedia.durationMs`, `tripNotes.audioMediaId`, `kind` index); `AudioRecorder` with format negotiation, mono 32 kbps, and the 120 s cap; a mic button, recording bar, and player in Quick Notes (later replaced by the custom recorder, player, and transcript toggle described under UX); `tripNoteRepository.createVoiceNote` writing the media row and the note in one transaction; gallery, journal, and feed filters (B7); blob retention on remote echo (B4); note deferral (B2); migration 74 (B1, B8, B9); persistent media retry diagnostics/retry handling (B3).
- **B2 shape:** a `tripNote` insert whose `audioMediaId` media is not `uploaded` is held without an attempt and replayed in the same sync pass right after `processPendingMedia`. Media still uploads after other mutations, because photo rows can reference activities that must exist first. If the media row is gone or deleted before upload, the note is sent without `audio_media_id` when it has a caption, and dropped when it has no caption or was itself deleted (it never reached the server).
- **`sync_cas_upsert('media')`:** not rewritten. Its insert path already uses `jsonb_populate_record` over the full payload, so `kind` and `duration_ms` are stored once the columns exist. Its update path lists columns explicitly, which keeps both immutable after insert. Because `jsonb_populate_record` inserts NULL for keys an older client omits, a BEFORE INSERT trigger defaults `kind` to `'photo'`; the same trigger forbids changing `kind`.
- **Note audio integrity:** a `trip_notes` trigger requires `audio_media_id` to point at the author's audio row on the same trip, and forbids changing it afterwards. The FK is `on delete cascade` rather than `set null`: with an empty caption, `set null` would violate the content check and block the media delete.
- **Viewer policies (D2):** members may insert audio rows (`activity_id is null`, path under `{tripId}/audio/`), and update or delete their own audio rows. Storage gets matching member insert, owner update, and owner delete policies on `{tripId}/audio/*` with audio extensions only.
- **Deferred to later phases:** `recordingDrafts` crash safety, B5 pass budget, B6 (remove the `navigator.onLine` early return in a separate change with reachability regression coverage), the status-line states that depend on transcripts, the consent line, and the feature flag (the mic is hidden when recording is unsupported instead).
- **Native builds:** the mic is hidden in Capacitor native builds until B11 (`NSMicrophoneUsageDescription`, Android `RECORD_AUDIO`) ships.

## Phase 3 Implementation Decisions (2026-10-05): dictation transcription backend

Viatik Product asked for the transcription backend for the dictation path (`private-audio` → `dictation_jobs`). These decisions supersede earlier sections where they differ.

- **Scope delivered:** migration 76 (`dictation_jobs`, the `private-audio` bucket and owner-only policies, client RPCs `create_dictation_job` and `ack_dictation_job`, service RPCs, the insert trigger, the `pg_cron` backstop, and the realtime entry) and the Edge Function `supabase/functions/transcribe-audio`.
- **Not yet delivered:** crew voice-note transcripts (`media_transcripts`, the `trip_media` audio trigger, and `kind: "media"` in the function), and all client work (Dexie `dictationClips` and `mediaTranscripts`, upload, pull, realtime, Journal UI). The function rejects `kind: "media"` with 400 until then.
- **Language hint (answers the open question):** the author's `profiles.preferred_language`, when it is a two-letter code. Otherwise Whisper detects the language. The stored `language` is the hint, or the detected language mapped from Whisper's language name.
- **Trigger:** the `dictation_jobs` insert, not a storage upload event. `create_dictation_job` refuses to create a job until the object exists at `{auth.uid()}/{tripId}/{jobId}.{webm|m4a|ogg|mp3}`, so the insert means "upload finished and registered". A storage trigger would fire before the job row exists.
- **Order of writes (D3):** the function saves the transcript first, then deletes the audio through the Storage API, then sets `audio_deleted_at`. Deleting first would lose both the audio and the transcript if the save failed. Audio is also deleted immediately for quota skips, permanent failures, and the last failed attempt.
- **Sweeps go through the function:** Supabase blocks SQL deletes on `storage.objects` (they would orphan files), so the 5-minute `run_dictation_maintenance` job POSTs `{ "kind": "sweep" }`; the function lists rows via `list_dictation_audio_cleanup` and deletes in one Storage batch. The same job clears `text` after 7 days, deletes `consumed` rows 30 days after ack once their audio is gone, and resends jobs that are `pending` for 2 min, `failed` with `attempts < 3`, or stuck `processing` for 10 min.
- **Attempts:** the claim increments `attempts` and allows at most 3. Non-retryable failures (`unsupported_format`, `too_large`, `audio_missing`, `empty_audio`) set `attempts` to 3 so they are never resent. Silence is `done` with empty text, not a failure, so it is not retried at cost.
- **Quotas:** a rolling 24 hours, counted from `processing`, `done`, and `consumed` jobs: 30 minutes per user and 60 per trip.
- **Ack:** `ack_dictation_job` also accepts `failed` and `skipped`, so a device that gives up stops server retries.
- **Shared Edge Function helpers:** `supabase/functions/_shared/http.ts` (secret check, JSON responses, service-role RPC). `whatsapp-dispatcher` uses it too.
- **Setup:** Vault secrets `transcribe_audio_url` and `transcribe_audio_secret`; function secrets `TRANSCRIBE_WEBHOOK_SECRET` (same value) and `OPENAI_API_KEY`; deploy with `verify_jwt = false` (set in `supabase/config.toml`); `pg_net` and `pg_cron` enabled on the project.

## Phase 3 Implementation Decisions (2026-10-05): voice-note transcription backend

Viatik Product asked for transcription of crew voice notes (`trip_media` rows with `kind = 'audio'`). The audio must stay in `trip-media` because the player streams it.

- **Where the transcript lives:** `media_transcripts`, as designed above, not a column on `trip_media`. A server write to `trip_media` bumps `updated_at` and `version` and would turn the author's offline edits into CAS conflicts. Clients only read it: select for trip members, with no insert, update, or delete grants (D4).
- **Migration 78:**
  - **Trigger:** `AFTER INSERT` on `trip_media` when `kind = 'audio'` and the row is not deleted. It inserts a `pending` transcript row and POSTs `{ "kind": "media", "id" }` through migration 76's `post_transcribe_audio` (same Vault secrets). It never raises, so a failure cannot roll back the upload's insert.
  - **Service RPCs:** `claim_media_transcription` and `complete_media_transcription`. The claim also creates a missing transcript row, so a plain Database Webhook on `trip_media` works too.
  - **Backstop:** `run_media_transcription_maintenance`, every 5 minutes. It fills in missing rows and resends rows `pending` for 2 min, `failed` with `attempts < 3`, or stuck `processing` for 10 min.
  - **Realtime:** `media_transcripts` is added to the publication.
- **Shared quota:** `transcription_usage_ms` counts dictation and voice notes together: 30 minutes per user and 60 per trip in a rolling 24 hours. `claim_dictation_job` is re-created to use it and is otherwise unchanged. A voice note without `duration_ms` counts as the 120 s cap. A quota skip is final.
- **Whisper hints:** `language` is the author's `preferred_language` when it is a two-letter code. `prompt` is the trip name and destination joined as a short list of terms, with no framing words that would bias the language. Logs never include either.
- **Audio retention:** the function never deletes from `trip-media`, including after permanent failures and quota skips. Deleting a voice note still removes the object through the existing media delete path.
- **Edge Function:** `transcribe-audio` now accepts `kind: "media"` and Database Webhook inserts on `trip_media`; photo inserts get 200 `skipped`. Dictation and voice notes share one download, validate, and Whisper step.
- **Delivered (client, 2026-10-05):** Dexie v44 adds the pull-only `mediaTranscripts` store keyed by `mediaId`; cloud sync pulls it using `media_id` pagination and maps snake_case fields plus remote version metadata. Pull and realtime writes are reconciled by version inside a Dexie transaction. `VoiceNoteCard` reactively reads its transcript through `useLiveQuery`, showing pending/processing, completed text and language, and terminal states through `TranscriptPanel`.
- **Client verification (2026-10-05):** focused Dexie, sync, voice-transcript and card tests pass (48 tests); full `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` pass.

## Completion Notes

- **Verification commands:** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- **Verification results (voice-note transcription backend, 2026-10-05):** `supabase/functions/transcribe-audio/*.test.ts` and `supabase/voice-note-transcription.test.ts` pass with the full suite. Migrations 76 and 78 were executed together in PGlite against the same stand-ins: 38 behavioral checks passed (trigger and its failure safety, RLS, claim once, hints, completion, retries, shared quota in both directions, backstop backfill and resend, cascade). Not yet applied to a Supabase project; OpenAI and Storage exercised through mocks only.
- **Verification results (Phase 3 backend, 2026-10-05):** `supabase/functions/transcribe-audio/{transcriber,whisper}.test.ts` and `supabase/dictation-transcription.test.ts` pass, along with the full suite. Migration 76 was also executed in PGlite (Postgres compiled to WebAssembly) against stand-ins for `auth`, `storage`, `vault`, `net`, and `cron`: 37 behavioral checks passed (RLS, path and upload checks, claim once, quotas, permanent failures, ack, cleanup listing, maintenance resend and sweep, trigger safety without secrets). It has not been applied to a Supabase project, and OpenAI and Storage were exercised only through mocks.
- **Verification results (Phases 1–2, 2026-10-05):** 184 test files / 1107 tests pass; typecheck, lint, and build pass. New coverage: `lib/db/voice-notes-migration.test.ts` (v43 backfill), `features/media/lib/audio-recorder.test.ts`, voice-note cases in `dexie-trip-note-repository.test.ts`, `trip-note-sync.test.ts`, `mappers-collaboration.test.ts`, `sync-engine.test.ts` (hold, replay after media, detach, drop), `cloud-sync.test.ts` (audio upload path, B4 blob retention, no photo feed item), `supabase/voice-note-media.test.ts` (static migration checks), and `trip-notes-board.test.tsx`. Migration 74 is verified statically only; it has not been applied to a database. Recording itself needs a manual check in a real browser.
- **Bug-ledger updates:** When Phase 0 lands, record the invariant: "Every table bound on the shared realtime channel must be in `supabase_realtime`, added by migration."
- **Follow-up work:** Evaluate `gpt-4o-mini-transcribe` (D5). Consider on-device `SpeechRecognition` as a progressive enhancement for dictation.
