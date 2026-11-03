---
name: spec-first-design
description: Write the spec in .ai/specs before touching code — journeys, Dexie/Supabase impact, EN/ES copy, accessibility, security
allowed-tools:
  - read
  - grep
  - glob
  - write
---

Read `.agents/skills/spec-design.md` and follow it exactly.

Short version: no production code until `.ai/specs/<feature-name>.md` exists and
covers What & Why, numbered user journeys (with the offline path), in/out of scope,
Dexie + Supabase impact, the EN/ES copy keys, accessibility, server-side
authorization, acceptance criteria, and the named test files.

Start from `.ai/templates/feature-spec.md`. Bugs use `.ai/templates/bug-report.md`
and live at `.ai/specs/bug-<slug>.md`. Read `.ai/CONTEXT.md` and
`memory/MEMORY.md` first. Anything the request did not name is out of scope —
`AGENTS.md` §9 applies before removing or redefining shipped behavior.
