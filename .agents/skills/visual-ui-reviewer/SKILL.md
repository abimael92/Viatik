---
name: visual-ui-reviewer
description: Review TSX changes against Viatik's UI standards — 44px targets, Radix a11y state, Tailwind v4 tokens
allowed-tools:
  - read
  - grep
  - glob
  - exec
---

Read `.agents/skills/ui-standards.md` and apply it to every `.tsx` in the diff.

The five checks that fail most often:

1. **44×44px** touch targets (`min-h-11`, `min-w-11` for icon-only). `size="sm"`
   (`h-9`) only in dense desktop toolbars.
2. **Disclosures keep `aria-expanded` + `aria-controls`** — reuse
   `components/ui/collapsible.tsx` instead of hand-rolling state.
3. **Tokens only**: classes from the `@theme inline` block in `app/globals.css`.
   No hex/rgb literals, no `tailwind.config.ts` (Tailwind v4 has none).
4. **Copy through `t()`** — then run `bash .agents/skills/i18n-audit.sh`.
5. **Both themes, 430px and 1280px**, nothing clipping at 200% zoom.

Verify with the component's colocated `*.test.tsx` (query by role + accessible
name) and `pnpm lint`. Never revert a design token to fix one component — tokens
ripple across every surface.
