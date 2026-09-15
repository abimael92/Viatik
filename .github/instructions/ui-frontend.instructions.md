---
description: "Use when writing or reviewing React/Next.js UI in components/, features/**/components/, or app/**/*.tsx. Covers layout width, card sections, primitives, and list/row patterns so AI-generated frontend code matches existing conventions."
applyTo: "components/**/*.tsx,features/**/components/**/*.tsx,app/**/*.tsx"
---

# UI/Frontend Conventions

## Page width — do not re-constrain it

`AppShell`'s `<main>` already applies `mx-auto max-w-7xl px-4 ... lg:px-8` to every authenticated page
([components/app-shell/app-shell.tsx](../../components/app-shell/app-shell.tsx)). Page-level components must
NOT add their own `mx-auto`/`max-w-*` wrapper around top-level content — doing so misaligns it against
sibling headers/buttons that don't have the same cap. Top-level page components use a plain:

```tsx
<div className="space-y-6"> ... </div>
```

Only use an internal `max-w-*` for things that are intentionally narrower than the page (e.g. a modal body,
a single form column) — never for a whole tab panel or list.

## Section/card wrapper

Content sections (lists, stats, forms) are wrapped in the same hand-rolled card treatment across Settings,
Home, Finance, and Contacts:

```tsx
<section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="...">
```

A `Card`/`CardHeader`/`CardContent` primitive exists at [components/ui/card.tsx](../../components/ui/card.tsx)
but is not the dominant pattern in this codebase yet — match the surrounding files' existing raw
`rounded-2xl border bg-card` convention rather than introducing `Card` inconsistently in an area that doesn't
already use it.

## Primitives — use them, don't hand-roll

- Buttons: `@/components/ui/button` (`Button`). Variants: `primary` (signature gradient CTA), `default`,
  `secondary`, `destructive`, `outline`, `ghost`, `link`. Sizes: `default`, `sm`, `lg`, `icon`. Never build a
  custom oversized square icon button — use `size="icon"` with `variant="ghost"`.
- Avatars: `@/components/ui/user-avatar` (`UserAvatar`), sizes `sm | md | lg`. Pass `seed`/`src`/`name`.
- Counts/status: `@/components/ui/badge` (`Badge`), variants `default | success | warning | destructive | muted | outline`.
- Headings: `@/components/ui/heading` (`Heading level={1..6}`), page title is `level={1}`.
- Segmented tab control (2–3 flat options, not a full Radix tab set): the pill pattern used in Contacts —
  `rounded-xl border border-border/40 bg-muted/40 p-1` wrapping buttons with
  `data-active` state as `bg-background text-foreground shadow-sm` vs `text-muted-foreground`.
  For richer tab content, use the Radix wrapper at `@/components/ui/tabs`.

## List/row pattern

Horizontal rows, not vertical cards, and no giant square accept/reject buttons:

```tsx
<div className="flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-muted/50">
  <UserAvatar ... size="sm" className="size-10" />
  <div className="min-w-0 flex-1">
    <p className="truncate text-sm font-medium">{name}</p>
    <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
  </div>
  <div className="flex shrink-0 gap-1">{/* ghost icon or pill actions */}</div>
</div>
```

- Relative timestamps use `date-fns`'s `formatDistanceToNow(date, { addSuffix: true })`.
- Group related but distinct row sets (e.g. inbound vs outbound requests) under a small muted section
  header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`.

## Empty states

Centered icon + heading + subtitle, not a bare line of text:

```tsx
<div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 px-6 py-16 text-center">
  <span className="grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">{icon}</span>
  <div className="space-y-1">
    <p className="text-sm font-semibold">{title}</p>
    <p className="text-xs text-muted-foreground">{subtitle}</p>
  </div>
</div>
```

## Before adding new UI

1. Check the width/card conventions above before wrapping a page or section in custom sizing.
2. Search `components/ui/` for an existing primitive before writing new button/badge/avatar markup.
3. Match the nearest existing feature (Settings, Home, Finance) rather than inventing a new layout language.
