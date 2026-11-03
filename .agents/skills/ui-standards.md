# Skill — visual UI reviewer

**Script:** none; run `.agents/skills/i18n-audit.sh` for the copy half.
**Enforced by:** `.ai/specs/design-system.md` · `.ai/skills/ui-component-generator.md`.

## Trigger

Any change to a `.tsx` file under `app/`, `components/`, or `features/`, or any
change to `app/globals.css`.

## Non-negotiables

1. **Touch targets are 44×44px minimum.** Use `min-h-11` (2.75rem) or larger on
   every button, tab, row, chip, and icon-only control. `size="sm"` buttons
   (`h-9`) are allowed only inside dense desktop toolbars, never on the mobile
   path. Icon-only controls also need `min-w-11` and an accessible name.
2. **Radix accessibility state stays intact.** Any disclosure (collapsible,
   accordion, expander, popover trigger) keeps `aria-expanded` and
   `aria-controls` pointing at the panel id. The canonical implementation is
   `components/ui/collapsible.tsx` — reuse it instead of hand-rolling state.
   Dialogs keep a title, focus trap, Escape handling, and the
   `isDialogDismissExempt()` guard for portaled content
   (`components/ui/dialog-dismiss.ts`).
3. **Theme tokens only.** Colors come from the `@theme inline` block in
   `app/globals.css` (`--color-background`, `--color-card`, `--color-side`, …)
   via Tailwind classes (`bg-card`, `text-muted-foreground`, `border-border`).
   No hex/rgb literals in components, no `tailwind.config.ts` (Tailwind v4 has
   none), no second styling system. A new token is added to `:root`, `.dark`, and
   `@theme inline` in the same change.
4. **Both themes, both widths.** Check light + dark, and 430px + 1280px. Nothing
   may overflow horizontally at 430px; no text may clip at 200% zoom.
5. **Copy goes through `t()`.** Run `bash .agents/skills/i18n-audit.sh`. Spanish
   strings run longer than English — buttons and tabs must survive that.
6. **Motion is optional.** Respect `prefers-reduced-motion`; never make meaning
   depend on an animation.
7. **Client components only where needed.** Browser APIs, Dexie, `liveQuery`,
   Zustand live in `"use client"` files; everything else stays a server
   component. Never import Dexie or a repository into a server component.

## Procedure

1. **SCAN** — list the existing primitives you can reuse (`components/ui/*`:
   `button`, `dialog`, `collapsible`, `selectable-card`, …) and the neighboring
   feature components. Copy the closest one's structure instead of inventing a
   new one.
2. **ASSEMBLE** — build with tokens + primitives. Every new string gets an
   `en`/`es` key in `lib/i18n/frontend-copy.ts`.
3. **TEST** — colocated `*.test.tsx` with Testing Library: query by role and
   accessible name, assert `aria-expanded` on disclosures, assert the dialog
   opens/closes, assert the empty and error states.
4. **REVIEW** — run the checklist above; run `pnpm lint` (Tailwind class typos and
   unused imports fail the gate) and the component's suite.

## Exit criteria

- 44px targets, accessible names, keyboard path, visible focus ring.
- Disclosures expose `aria-expanded` + `aria-controls`.
- No raw colors, no `tailwind.config.ts`, no inline copy.
- Colocated tests pass; light/dark and 430/1280 checked.

## Rollback

Revert the component file, not the design tokens: token edits ripple across every
surface. If a token change is genuinely required, ship it as its own change with
a before/after note in `memory/components-ui.md`.
