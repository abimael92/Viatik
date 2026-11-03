# Skill — spec first, code second

**Script:** none (this is a writing gate).
**Enforced by:** `.ai/constitution.md` rule 2 · `AGENTS.md` §6.

## Trigger

Start this skill when any of these is true:

- a new feature, route, tab, dialog, or workflow,
- a schema change (Dexie, Supabase, mappers, sync tables),
- a behavior change to something that already ships,
- a new dependency,
- a "small" change whose acceptance criteria you cannot state in one sentence.

A bug fix uses `.ai/templates/bug-report.md` instead; the gate is the same.

## Inputs

- The user's request, verbatim.
- `.ai/CONTEXT.md`, `memory/MEMORY.md`, and the matching topic file
  (`data-models.md` / `components-ui.md` / `roles-abilities.md`).
- `.ai/templates/feature-spec.md`.

## Procedure

1. **Write the spec before touching code.** Create `.ai/specs/<feature-name>.md`
   (bugs: `.ai/specs/bug-<slug>.md`) from the template. If a spec already exists,
   update it instead of writing a second one.
2. **What & Why.** One paragraph a traveler could understand. If you cannot say
   why it matters, stop and ask.
3. **User journeys.** Number them, name the actor (owner / editor / viewer /
   guest via `/share/[slug]`), and state the offline path for each. A journey
   that needs the network is an exception and must be written down as one.
4. **Scope.** In scope / out of scope. Anything the request did not name is out
   of scope — see `AGENTS.md` §9 before deleting, relocating, or redefining
   anything that ships.
5. **Data impact.**
   - Dexie: new tables, new indexes, new `this.version(N)`? (run
     `node .agents/skills/verify-schema.ts` afterwards — see `db-guardian.md`)
   - Supabase: migration, RLS policy, `lib/supabase/mappers.ts`,
     `SYNC_TABLE_DEFINITIONS`, `OutboxEntityType`.
   - Money: amounts are `bigint` minor units; say which currency and exponent
     path you use.
   - State that is local-only and must **not** append outbox entries.
6. **Copy review (EN/ES).** List every new user-facing string and its
   `lib/i18n/frontend-copy.ts` key. Both `en` and `es` land in the same change;
   Spanish is written, not machine-translated, and keeps the same meaning and
   length budget (button labels stay short). No string concatenation — use
   `{{placeholders}}`.
7. **Accessibility.** Every interactive element: 44×44px target, accessible name,
   keyboard path, visible focus. Disclosures need `aria-expanded` +
   `aria-controls`. Dialogs need a title, focus trap, and Escape. Charts/images
   need a text alternative. Call out anything that will fail at 200% zoom.
8. **Security.** Who can do this? Which RLS policy enforces it server-side?
   Client `canEdit` is UX only. List untrusted inputs and where they are
   validated (Zod at the boundary).
9. **Acceptance criteria.** Checkboxes that a QA agent can verify without asking
   you what you meant.
10. **Test plan.** Named suites (`*.test.ts(x)` paths), plus any Playwright spec
    under `e2e/`. Write the failing test before the implementation.
11. **Only now** implement, smallest correct change, Red → Green → Refactor.

## Exit criteria

- The spec exists, every `[PLACEHOLDER]` is replaced, and its acceptance criteria
  are checkable.
- The user journey and offline path are written for each flow.
- EN and ES keys are listed.
- A failing test exists before production code.

## Rollback

The spec is the rollback anchor: if implementation drifts, revert the code to the
spec or update the spec in the same change — never leave the two disagreeing.
Never delete a shipped spec; mark it superseded and link the successor.
