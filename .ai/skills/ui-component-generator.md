# UI Component Generator Protocol

**Project:** Viatik
**Purpose:** Govern how AI agents and developers build UI components so every surface is consistent, reusable, accessible, and tested.
**Required reading:** [`../constitution.md`](../constitution.md), [`../AGENTS.md`](../AGENTS.md), [`../specs/design-system.md`](../specs/design-system.md)
**Framework entry point:** [`../llms.txt`](../llms.txt)

## When to Use This Protocol

Use this protocol for any request that produces or edits UI: "build a new dashboard
widget", "create a settings panel", "design a modal", "add a form", "restyle a
component", and so on. It applies whether the change is new UI or a modification to
existing UI.

Do not start writing markup until the four phases below are satisfied. The protocol
leaves behind a reusable component (or a justified reuse of an existing one), a
matching test, and a design-system-compliant surface.

## Protocol Sequence

```text
READ -> SCAN -> ASSEMBLE -> TEST
```

## Phase 1 — READ (Constraint Verification)

Before writing any code, the agent **must**:

1. Read [`../specs/design-system.md`](../specs/design-system.md) in full.
2. Read [`app/globals.css`](../../app/globals.css) tokens if the component uses
   color, radius, type, or motion — the code there is authoritative.
3. Read the relevant feature spec or bug report for the work being done.

Then enforce the "Premium SaaS" aesthetic and its hard constraints:

- **OKLCH tokens** — never hardcode a color, radius, or type size that has a token.
- **Glassmorphism** — use `bg-card/70 backdrop-blur-md` glass (via `Card glass` or
  `--side`) only for surfaces that should read as *raised*; use solid `bg-card` for
  the default.
- **Precise easing** — the project's motion token is
  `duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]` for surfaces; dialogs use ~0.15s
  opacity/scale; honor `prefers-reduced-motion` (never add ad-hoc disable logic).
- **Touch targets** — every interactive control is **≥ 44×44px** (`min-h-11` /
  `min-w-11` / `h-11` / `size-11`). `h-9` (`sm`) is allowed only where a 44px target
  is impractical; keep spacing adequate.
- **Focus rings** — `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.

## Phase 2 — SCAN (Component Inventory & Reuse)

Before building, the agent **must** scan [`components/ui/`](../../components/ui/)
and the surrounding feature code to identify existing primitives.

- List what already exists (Button, Card, Dialog, DropdownMenu, Tabs, Label, Input,
  Badge, Heading, Collapsible, IconTile, AvatarPicker, UserAvatar) and any feature-local
  components in the target area.
- **Forbid reinventing the wheel.** Do not write a custom dropdown if
  `DropdownMenu` already exists; do not re-implement a modal if `Dialog` exists; do
  not build a hand-rolled disclosure when `Collapsible` exists. "Reuse the existing
  primitive" applies to the `components/ui/*` wrappers regardless of whether they are
  Radix-backed or custom (e.g. `Collapsible` is custom-built on `motion`, not Radix).
- If an existing primitive covers the need, compose/extend it with props rather than
  duplicating it. Only add a new `components/ui/*` primitive when a real gap exists,
  and record the decision in the spec.

**Checklist:**
- [ ] Scanned `components/ui/` and the target feature directory.
- [ ] Identified every existing primitive that applies.
- [ ] Confirmed whether this is **new primitive**, **composition of existing**, or **extension**.
- [ ] Justified in the spec why no existing primitive was sufficient (if building new).

## Phase 3 — ASSEMBLE (Structural Execution & Progressive Disclosure)

### Progressive disclosure for complex data — mandated

**Mandate:** complex data **must** be revealed progressively, never dumped at once.
For any dense dataset, choose the lightest disclosure mechanism that fits, and do
**not** present all fields/records on a single screen:

- **Collapsible panels** — for inline sections that expand/collapse in place
  (`components/ui/collapsible.tsx`).
- **Tabs** — for mutually exclusive views of the same dataset
  (`components/ui/tabs.tsx`, Radix-backed).
- **Drawers** — for detail that belongs outside the main flow, following the existing
  drawer flow in the app (e.g. the AI Scout drawer rendered from `app/actions/ai-scout.ts`).
- **Dialog** — for focused, confirm-or-dismiss overlays (`components/ui/dialog.tsx`).

Use progressive disclosure to prevent cognitive overload: keep the default view
scannable, and reveal detail on demand.

### Follow existing patterns — do not invent layouts

New layouts **must follow the responsive patterns already present in the repository**:

- **Responsive `Card` grid** — solid `Card`/glass `Card glass` surfaces with `p-5`
  gutters for dashboards and widget collections.
- **Sidebar** — a persistent vertical rail on `lg+` viewports and a compact/mobile
  variant below it, matching the existing shell in
  `components/app-shell/app-shell.tsx`
  (`<aside className="... hidden w-64 ... lg:flex">` + `--side` tokens). Do not
  introduce a new navigation/shell layout.
- **Collapsible panels / tabs / drawers** — the disclosure primitives above.

Reuse these before inventing a new layout system. Keep the default view scannable and
reveal detail on demand.

### Responsive and mobile-first by default

Every new layout **must be responsive and mobile-friendly by default**:

- **Stack on small viewports, expand on `sm`/`md`/`lg`.** Mirror the `flex-col-reverse
  sm:flex-row` footer-action pattern and the `hidden ... lg:flex` sidebar pattern.
  Design mobile first; never ship a desktop-only layout.
- Use **container queries** (`.cq { container-type: inline-size }`) so nested
  components respond to their own width when a layout is data-driven (itinerary
  boards, day columns, dashboard widgets).
- Use `Card` gutters `p-5` (content) / `p-6` (dialogs), and the tokenized radius
  scale (`rounded-lg` controls, `rounded-2xl` cards/dialogs/panels).
- Use lucide icons with the global `stroke-width: 1.75`; pass `aria-hidden` on
  decorative icons.

### Accessibility baked into structure

- Keyboard + touch: delegate to Radix primitives (arrows, focus trap, Esc); never
  re-implement.
- Disclosure: `aria-expanded` / `aria-controls` on the trigger, `role="region"`
  + `aria-labelledby` on the panel.
- Status changes: `role="alert"` / `aria-live` where the UI announces async results.
- Icon-only controls: `aria-label` (e.g. dialog close `size-11` button).
- Contrast/focus/reduced-motion per the design system.

## Phase 4 — TEST (Testing & Verification)

The agent **must** write a matching Vitest rendering + interaction test **before**
handing off the feature (Red-Green where practical — write it with the feature).

Place tests next to the component using the existing convention
(e.g. `components/ui/user-avatar.test.tsx`), using Vitest + `@testing-library/react`
(jsdom).

Tests must cover:

- **Rendering:** the component renders the expected structure with expected content.
- **Interaction:** primary state toggles behave correctly (open/close, selected tab,
  dialog opens/closes, collapsible expands).
- **Accessibility attributes:** assert the presence and correctness of `aria-expanded`,
  `aria-controls`, `role="region"`, `aria-labelledby`, `role="alert"`, `aria-live`,
  focus rings (`focus-visible` handling), and `aria-label` on icon-only controls.
- **Boundary/state:** disabled states, empty states, and mobile behavior where the
  component branches on it.

Then run, in order, and record exact commands + results:

1. The new component test (must pass).
2. Related unit/integration tests.
3. `pnpm lint` and `pnpm typecheck`.
4. `pnpm build` when the change affects buildable output.
5. `pnpm test:e2e` for flows that depend on routing/auth/storage.
6. Verify `prefers-reduced-motion` and a mobile viewport manually or via E2E where relevant.

Never claim a command passed unless it was actually run. Do not weaken tests to make
them pass.

## Completion Checklist

- [ ] Phase 1: read design-system.md + globals.css tokens; constraints enforced.
- [ ] Phase 2: scanned components/ui + feature dir; reuse justified.
- [ ] Phase 3: progressive disclosure **mandated** for complex data (collapsible/tabs/drawer/dialog).
- [ ] Phase 3: layout follows existing card/sidebar/collapsible patterns; no invented layout.
- [ ] Phase 3: responsive and mobile-first by default; a11y attributes wired.
- [ ] Phase 4: Vitest rendering + interaction test written and passing.
- [ ] Test asserts the relevant accessibility attributes.
- [ ] `pnpm lint`, `pnpm typecheck`, related `pnpm test`, and (where applicable) `pnpm build` pass.
- [ ] Feature spec or bug report updated with the component decision and verification evidence.
