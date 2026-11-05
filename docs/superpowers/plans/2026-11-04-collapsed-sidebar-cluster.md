# Avatar-Centered Collapsed Sidebar Dock Plan

> **For agentic workers:** Execute inline in this session. Preserve all existing controls and behavior.

**Goal:** Keep the avatar centered in the collapsed rail, with only the unread-count circle over its upper-right and the hollow status-color ring around the avatar.

**Architecture:** Keep the existing account, notification, and sync interfaces. Use an unframed portrait layout, hide the compact bell glyph, and move the compact sync trigger behind the avatar as its outline ring. Leave expanded/mobile layouts unchanged.

**Tech Stack:** Next.js 16, React, Tailwind CSS v4, Testing Library, Vitest, frontend EN/ES dictionaries.

**Spec:** `.ai/specs/app-shell-collapsible-sidebar.md`, Amendment 2026-11-04.

## Global Constraints

- Only the collapsed desktop rail changes; expanded account card, mobile account UI, navigation, sidebar width, sync and notification behavior stay unchanged.
- Keep accessible names, visible focus, and 44px interactive targets; visual bubbles may be smaller.
- Use existing theme tokens; no enclosing frame/background/border; no Dexie, Supabase, schema, or outbox changes.

## Review Focus

- Notification bubble retains its unread count and accessible link — test compact and regular variants in `notification-bell.test.tsx`.
- Sync ring encircles the avatar and retains status-specific visuals, accessible state, dropdown anchoring, and a 52px target — assert in `app-shell.test.tsx`.
- Dock remains unframed with an unobstructed centered avatar — assert geometry and separate controls in `app-shell.test.tsx`.

---

### Task 1: Pin the supplied composition in tests

**Files:**
- Modify: `components/app-shell/app-shell.test.tsx`
- Modify: `features/notifications/components/notification-bell.test.tsx`

- [x] Update the AppShell test to require a `w-14 h-28` unframed dock, centered account control above a hollow 52px sync ring, and upper-right count overlay; keep all accessible names.
- [x] Update `NotificationBell compact` coverage to assert no bell glyph, a visible count, and the unchanged 44px link target.
- [x] Run both focused tests and confirm the new composition assertions failed before implementation.

### Task 2: Build the avatar-centered dock

**Files:**
- Modify: `components/app-shell/app-shell.tsx`
- Modify: `features/notifications/components/notification-center.tsx`
- Modify: `components/app-shell/sync-status-pill.tsx`
- Modify: `lib/i18n/frontend-copy.ts`

- [x] Keep the centered avatar and count overlay, removing the enclosing dock frame/background/border.
- [x] Hide the compact bell glyph and purple tile while preserving the notification link, count, and 44px target.
- [x] Position one hollow status-color sync outline around the avatar, behind its account action; preserve the sync button's 52px target and popup anchor.
- [x] Keep the localized dock group name and all regular/expanded render paths unchanged.
- [x] Run focused tests and confirm both pass.

### Task 3: Verify and record

**Files:**
- Modify: `memory/MEMORY.md`
- Modify: `memory/components-ui.md`

- [x] Run focused notification/AppShell/i18n tests, `pnpm lint`, `pnpm typecheck`, and `bash .agents/skills/i18n-audit.sh`.
- [x] Review token use, hit areas, light/dark styling, and collapsed-only scope; record verification and visual-review limits in memory.

### Task 4: Anchor the collapsed expand control

**Files:**
- Modify: `app/globals.css`
- Verify: `components/app-shell/app-shell.test.tsx`

- [x] In the collapsed rail, position `.sidebar-toggle-btn` at the brand row's top-right, reserving 44px above the logo to prevent overlap.
- [x] Reduce only the chevron's visible size to 16px; keep the button's 44px target and existing ARIA behavior.
- [x] Verify the collapse/expand test, lint, typecheck, i18n audit, and diff checks.

### Task 5: Tighten the collapsed expander

**Files:**
- Modify: `app/globals.css`
- Modify: `.ai/specs/app-shell-collapsible-sidebar.md`

- [x] Offset the collapsed expander to the panel's top/right edge, without changing the expanded placement.
- [x] Reduce the visible chevron to 14px and remove the filled hover tile; preserve its 44px hit area and focus ring.
- [x] Run the AppShell suite, lint, typecheck, i18n audit, and diff checks.

### Task 6: Reduce brand-row clearance

**Files:**
- Modify: `app/globals.css`
- Modify: `.ai/specs/app-shell-collapsible-sidebar.md`

- [x] Reduce the collapsed brand row's top reserve from 44px to 16px, keeping clear separation from the corner chevron.
- [x] Verify the collapse/expand suite and standard UI checks.

### Task 7: Move collapsed utilities into the account menu

**Files:**
- Modify: `components/app-shell/app-shell.tsx`
- Modify: `components/ui/dropdown-menu.tsx`
- Modify: `components/app-shell/theme-toggle.tsx`
- Modify: `lib/i18n/frontend-copy.ts`
- Test: `components/app-shell/app-shell.test.tsx`

- [x] Add a failing AppShell assertion that collapsed utilities are hidden from the rail and exposed in the avatar's `View options` submenu.
- [x] Add accessible submenu and radio-item wrappers; add localized View options copy.
- [x] Move compact theme, EN/ES, and Search actions into the rail-only submenu; preserve expanded/mobile utilities and the global shortcut.
- [x] Run focused tests, lint, typecheck, i18n audit, and diff checks.
