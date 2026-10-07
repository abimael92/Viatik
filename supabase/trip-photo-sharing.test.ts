import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = join(process.cwd(), "supabase/migrations");
const migration = readFileSync(join(migrations, "00000000000080_trip_photo_sharing.sql"), "utf8").toLowerCase();
const securityFollowUp = readFileSync(join(migrations, "00000000000081_trip_media_security_followup.sql"), "utf8").toLowerCase();
const visibilityFollowUp = readFileSync(join(migrations, "00000000000082_trip_media_public_gallery.sql"), "utf8").toLowerCase();
const invitationLifecycleFix = readFileSync(join(migrations, "00000000000083_fix_trip_invitation_lifecycle_trigger.sql"), "utf8").toLowerCase();
const baseline = readFileSync(join(migrations, "00000000000008_collaboration_and_media.sql"), "utf8").toLowerCase();

describe("trip photo sharing authorization migration", () => {
  it("allows current members to contribute photos and limits metadata changes to the contributor", () => {
    expect(migration).toContain('create policy "trip_media_insert_member_photo"');
    expect(migration).toMatch(/kind = 'photo'[\s\S]*is_trip_member\(trip_id\)[\s\S]*created_by = auth\.uid\(\)/);
    expect(migration).toContain('create policy "trip_media_update_own_photo"');
    expect(migration).toMatch(/using \(\s*kind = 'photo'\s+and created_by = auth\.uid\(\)\s+and public\.is_trip_member\(trip_id\)\s*\)/);
    expect(migration).toContain('create policy "trip_media_delete_own_photo"');
    expect(migration).toMatch(/for delete[\s\S]*kind = 'photo'[\s\S]*created_by = auth\.uid\(\)/);
  });

  it("authorizes photo storage read by membership, while write, upsert, and removal are contributor-scoped", () => {
    expect(baseline).toContain('create policy "trip_media_objects_select"');
    expect(baseline).toMatch(/bucket_id = 'trip-media'[\s\S]*is_trip_member/);
    expect(migration).toContain('create policy "trip_media_objects_insert_member_photo"');
    expect(migration).toContain('create policy "trip_media_objects_update_own_photo"');
    expect(migration).toContain('create policy "trip_media_objects_delete_own_photo"');
    expect(migration).toMatch(/owner_id = auth\.uid\(\)::text/);
    expect(migration).toMatch(/is_trip_member\(\(\(storage\.foldername\(name\)\)\[1\]\)::uuid\)/);
  });

  it("keeps the initial photo migration additive and preserves its audio delete behavior", () => {
    expect(migration).toMatch(/create policy "trip_media_delete_audio_owner_or_editor"[\s\S]*for delete[\s\S]*kind = 'audio'[\s\S]*created_by = auth\.uid\(\) or public\.is_trip_editor\(trip_id\)[\s\S]*is_trip_member\(trip_id\)/);
    expect(migration).toMatch(/create policy "trip_media_objects_delete_audio_editors"[\s\S]*for delete[\s\S]*\[2\] = 'audio'[\s\S]*is_trip_editor/);
    expect(migration).not.toMatch(/delete from public\.trip_media/);
    expect(migration).not.toMatch(/function public\.sync_cas_upsert/);
    expect(migration).toContain('drop policy if exists "trip_media_insert_editors"');
    expect(migration).toContain('drop policy if exists "trip_media_update_editors"');
    expect(migration).toContain('drop policy if exists "trip_media_delete_editors"');
  });

  it("replaces all broad media read policies with the active, non-deleted trip-member predicate", () => {
    expect(securityFollowUp).toMatch(/create or replace function public\.is_active_trip_media_member\(p_trip_id uuid\)[\s\S]*returns boolean[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = public/);
    expect(securityFollowUp).toMatch(/t\.id = p_trip_id[\s\S]*t\.deleted_at is null[\s\S]*tm\.user_id = auth\.uid\(\)[\s\S]*tm\.removed_at is null[\s\S]*tm\.deleted_at is null/);
    expect(securityFollowUp).toMatch(/drop policy if exists "trip_media_select_members"[\s\S]*create policy "trip_media_select_members"[\s\S]*is_active_trip_media_member\(trip_id\)/);
    expect(securityFollowUp).toMatch(/drop policy if exists "trip_media_objects_select"[\s\S]*create policy "trip_media_objects_select"[\s\S]*for select[\s\S]*is_active_trip_media_member/);
    for (const policy of ["trip_media_insert_member_photo", "trip_media_update_own_photo", "trip_media_delete_own_photo"]) {
      expect(securityFollowUp).toContain(`drop policy if exists "${policy}"`);
      expect(securityFollowUp).toContain(`create policy "${policy}"`);
    }
    expect(securityFollowUp).toMatch(/trip_media_(insert_member|update_own|delete_own)_photo[\s\S]*is_active_trip_media_member/);
    expect(securityFollowUp).not.toMatch(/create policy "trip_media_objects_select_[^"]+"/);
    expect(securityFollowUp).not.toMatch(/create or replace function public\.is_trip_member/);
  });

  it("recreates audio insert, update, and storage policies without changing author/editor capabilities", () => {
    for (const policy of ["trip_media_insert_member_audio", "trip_media_update_own_audio", "trip_media_objects_insert_member_audio", "trip_media_objects_update_own_audio", "trip_media_objects_delete_own_audio"]) {
      expect(securityFollowUp).toContain(`drop policy if exists "${policy}"`);
      expect(securityFollowUp).toContain(`create policy "${policy}"`);
    }
    expect(securityFollowUp).toMatch(/trip_media_insert_member_audio[\s\S]*kind = 'audio'[\s\S]*is_active_trip_media_member\(trip_id\)[\s\S]*created_by = auth\.uid\(\)/);
    expect(securityFollowUp).toMatch(/trip_media_update_own_audio[\s\S]*created_by = auth\.uid\(\)[\s\S]*is_active_trip_media_member\(trip_id\)/);
    expect(securityFollowUp).toMatch(/trip_media_objects_insert_member_audio[\s\S]*\/audio\/[\s\S]*is_active_trip_media_member/);
    expect(securityFollowUp).toMatch(/trip_media_objects_update_own_audio[\s\S]*owner_id = auth\.uid\(\)::text[\s\S]*is_active_trip_media_member/);
    expect(securityFollowUp).toMatch(/trip_media_objects_delete_own_audio[\s\S]*owner_id = auth\.uid\(\)::text[\s\S]*is_active_trip_media_member/);
    expect(securityFollowUp).toMatch(/trip_media_delete_audio_owner_or_editor[\s\S]*created_by = auth\.uid\(\) or public\.is_trip_editor\(trip_id\)[\s\S]*is_active_trip_media_member/);
    expect(securityFollowUp).toMatch(/trip_media_objects_delete_audio_editors[\s\S]*is_trip_editor[\s\S]*is_active_trip_media_member/);
  });

  it("requires owner-scoped photo uploads and an exact canonical trip/media UUID path", () => {
    expect(securityFollowUp).toMatch(/trip_media_objects_insert_member_photo[\s\S]*owner_id = auth\.uid\(\)::text[\s\S]*\^\[0-9a-f\]/);
    expect(securityFollowUp).toContain("/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|heic)$'");
  });

  it("enforces photo metadata constraints, immutable identity fields, activity ownership, and uploaded-object ownership", () => {
    expect(securityFollowUp).toMatch(/create or replace function public\.validate_trip_media_metadata\(\)[\s\S]*security definer[\s\S]*set search_path = public, storage/);
    expect(securityFollowUp).toMatch(/image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp[\s\S]*image\/heic/);
    expect(securityFollowUp).toMatch(/byte_size < 1 or new\.byte_size > 10485760/);
    expect(securityFollowUp).toMatch(/new\.storage_path[\s\S]*new\.trip_id::text[\s\S]*new\.id::text/);
    expect(securityFollowUp).toMatch(/image\/jpeg' and split_part\(new\.storage_path, '\.', 2\) not in \('jpg', 'jpeg'\)/);
    expect(securityFollowUp).toMatch(/image\/png' and split_part\(new\.storage_path, '\.', 2\) <> 'png'/);
    expect(securityFollowUp).toMatch(/image\/webp' and split_part\(new\.storage_path, '\.', 2\) <> 'webp'/);
    expect(securityFollowUp).toMatch(/image\/heic' and split_part\(new\.storage_path, '\.', 2\) <> 'heic'/);
    expect(securityFollowUp).toMatch(/select 1 from public\.activities[\s\S]*a\.id = new\.activity_id[\s\S]*a\.trip_id = new\.trip_id/);
    for (const field of ["id", "trip_id", "created_by", "storage_path", "kind", "content_type", "byte_size"]) {
      expect(securityFollowUp).toContain(`new.${field} is distinct from old.${field}`);
    }
    expect(securityFollowUp).toMatch(/new\.deleted_at is null[\s\S]*storage\.objects[\s\S]*bucket_id = 'trip-media'[\s\S]*name = new\.storage_path[\s\S]*owner_id = new\.created_by::text/);
    expect(securityFollowUp).not.toMatch(/new\.(caption|deleted_at|deleted_by|restored_at|restored_by) is distinct from old\./);
    expect(securityFollowUp).toMatch(/before insert or update on public\.trip_media/);
  });

  it("migrates legacy gallery visibility and prevents private photos becoming public", () => {
    expect(visibilityFollowUp).toMatch(/add column public_gallery boolean/);
    expect(visibilityFollowUp).toMatch(/set public_gallery = true[\s\S]*where kind = 'photo'/);
    expect(visibilityFollowUp).toMatch(/set public_gallery = false[\s\S]*where kind = 'audio'/);
    expect(visibilityFollowUp).toMatch(/create or replace function public\.guard_trip_media_public_gallery\(\)[\s\S]*tg_op = 'insert'[\s\S]*new\.public_gallery is true[\s\S]*old\.public_gallery is not true and new\.public_gallery is true/);
    expect(visibilityFollowUp).toMatch(/old\.deleted_at is not null[\s\S]*new\.deleted_at is null[\s\S]*new\.public_gallery := false/);
    expect(visibilityFollowUp).toMatch(/if old\.public_gallery is true and new\.public_gallery is distinct from true then[\s\S]*new\.public_gallery := true/);
    expect(visibilityFollowUp).toMatch(/before insert or update on public\.trip_media/);
    expect(visibilityFollowUp).not.toMatch(/create or replace function public\.sync_cas_upsert/);
  });

  it("uses active membership for transcripts and avoids role demotion on repeat invitation acceptance", () => {
    expect(visibilityFollowUp).toMatch(/drop policy if exists "media_transcripts_select_member"[\s\S]*create policy "media_transcripts_select_member"[\s\S]*is_active_trip_media_member\(trip_id\)/);
    expect(visibilityFollowUp).toContain("on conflict (trip_id, user_id) do update set");
    expect(visibilityFollowUp).toContain("when public.trip_members.role = 'owner' then public.trip_members.role");
    expect(visibilityFollowUp).toContain("when public.trip_members.removed_at is not null or public.trip_members.deleted_at is not null then excluded.role");
    expect(visibilityFollowUp).toContain("else public.trip_members.role");
    expect(visibilityFollowUp).toMatch(/removed_at = null[\s\S]*removed_by = null[\s\S]*deleted_at = null[\s\S]*deleted_by = null/);
  });

  it("recreates the invitation lifecycle trigger without referencing absent columns", () => {
    expect(invitationLifecycleFix).toMatch(/create or replace function public\.set_trip_invitations_lifecycle_metadata\(\)[\s\S]*returns trigger[\s\S]*security invoker[\s\S]*new\.updated_at := now\(\)[\s\S]*if tg_op = 'insert' then[\s\S]*new\.version := 1[\s\S]*new\.status_changed_at := now\(\)[\s\S]*new\.status_changed_by := new\.invited_by[\s\S]*else[\s\S]*new\.version := old\.version \+ 1[\s\S]*if new\.status is distinct from old\.status then[\s\S]*new\.status_changed_at := now\(\)/);
    for (const status of ["accepted", "rejected", "revoked"]) {
      expect(invitationLifecycleFix).toContain(`new.status = '${status}'`);
      expect(invitationLifecycleFix).toContain(`new.${status}_at := now()`);
      expect(invitationLifecycleFix).toContain(`new.${status}_by :=`);
    }
    expect(invitationLifecycleFix).not.toMatch(/new\.updated_by/);
    expect(invitationLifecycleFix).not.toMatch(/alter table public\.trip_invitations[\s\S]*add column[^;]*updated_by/);
  });

  it("reactivates all soft-removal fields when an invited member accepts again", () => {
    expect(securityFollowUp).toMatch(/create or replace function public\.accept_trip_invitation\(p_invitation_id uuid\)[\s\S]*returns public\.trip_members[\s\S]*security definer[\s\S]*set search_path = public/);
    expect(securityFollowUp).toMatch(/on conflict \(trip_id, user_id\) do update set[\s\S]*role = excluded\.role/);
    expect(securityFollowUp).toMatch(/on conflict \(trip_id, user_id\) do update set[\s\S]*removed_at = null[\s\S]*removed_by = null[\s\S]*deleted_at = null[\s\S]*deleted_by = null/);
    expect(securityFollowUp).toContain("if actor is null then raise exception 'authentication required'");
    expect(securityFollowUp).toMatch(/from public\.trip_invitations where id = p_invitation_id for update/);
    expect(securityFollowUp).toMatch(/invitation\.invited_user_id <> actor[\s\S]*lower\(invitation\.email\) <> lower\(coalesce\(auth\.jwt\(\) ->> 'email', ''\)\)/);
    expect(securityFollowUp).toContain("revoke all on function public.accept_trip_invitation(uuid) from public");
    expect(securityFollowUp).toContain("grant execute on function public.accept_trip_invitation(uuid) to authenticated");
  });
});
