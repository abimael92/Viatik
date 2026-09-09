# Viatik Design System

**Project:** Viatik
**Owner:** [DESIGN_OWNER]
**Status:** Approved
**Created:** [YYYY-MM-DD]
**Updated:** [YYYY-MM-DD]

> This spec is the authoritative source of truth for Viatik UI conventions. It is
> required reading for any UI work. The **authoritative runtime source is
> [`app/globals.css`](../../app/globals.css)** — if the code and this spec ever
> disagree, the code wins and this spec must be corrected. Component wrappers live
> in [`components/ui/`](../../components/ui/). The UI-building protocol is in
> [`../skills/ui-component-generator.md`](../skills/ui-component-generator.md).

## Aesthetic Direction

Viatik is a **"Premium SaaS"** product: dark/navy productivity surfaces inspired by
Raycast/Linear, with crisp glass cards, a signature electric-blue → magenta →
coral-red gradient, and precise, restrained motion. Flat white-on-white is avoided —
the light canvas is slightly cool-tinted so cards and glass read as depth.

## Color Tokens (OKLCH)

All tokens are OKLCH and live in `app/globals.css`. Light values on `:root`, dark
overrides on `[data-theme="dark"]`, mirrored for `prefers-color-scheme`. There is no
`tailwind.config.ts` — tokens flow through `@theme inline` so utilities stay in sync.

| Token | Light value | Dark value | Usage |
|---|---|---|---|
| `--background` | `oklch(0.985 0.004 260)` | `#090a0f` | App canvas |
| `--foreground` | `oklch(0.18 0.02 264)` | `oklch(0.95 0.005 264)` | Primary text |
| `--card` | `oklch(1 0 0)` | `oklch(0.2 0.015 264)` | Card/popover surfaces |
| `--primary` | `#a855f7` | `#a855f7` | Brand magenta, links, default fill |
| `--secondary` | `oklch(0.7 0.14 180)` | `oklch(0.6 0.12 180)` | Secondary fills |
| `--muted` | `oklch(0.955 0.005 260)` | `oklch(0.26 0.015 264)` | Muted surfaces |
| `--muted-foreground` | `oklch(0.44 0.02 264)` | `oklch(0.68 0.015 264)` | Secondary text |
| `--accent` | `oklch(0.85 0.13 90)` | `oklch(0.55 0.11 90)` | Accent surfaces |
| `--destructive` | `oklch(0.58 0.22 27)` | `oklch(0.55 0.2 27)` | Danger/errors |
| `--success` | `oklch(0.65 0.16 150)` | `oklch(0.58 0.15 150)` | Success states |
| `--border` | `oklch(0.86 0.012 264)` | `oklch(0.32 0.015 264)` | Hairline borders |
| `--ring` | `#9333ea` | `#a855f7` | Focus rings |

### Brand palette (signature V-icon)

| Token | Value | Reserved usage |
|---|---|---|
| `viatik-blue` | `#0ea5e9` | Structural depth, active sidebars, cool surfaces |
| `viatik-magenta` | `#a855f7` | Primary brand, focus states, ambient glow |
| `viatik-red` | `#f43f5e` | Signature particle tip — **strictly primary CTAs & critical actions** |
| `surface-dark` | `#090a0f` | Raycast/Linear-style dark productivity canvas |

Helpers: `.bg-viatik-gradient` (blue→magenta→red `135deg`), `.glow-viatik`, `.glow-magenta` ambient washes.

## Typography

Geist Sans + Geist Mono via `--font-geist-sans` / `--font-geist-mono`. A larger scale
is defined in `app/globals.css` (`@theme`, `text-xs` through `text-4xl`, line-heights
scaled). Use the semantic utilities (`text-sm`, `text-muted-foreground`) rather than
raw sizes. Titles: `text-base`/`text-lg` `font-semibold`; secondary text: `text-sm
text-muted-foreground`.

## Iconography

Lucide icons via `lucide-react`. A global rule sets `.lucide { stroke-width: 1.75 }`
so every icon shares the same authored weight. Pass `aria-hidden` for decorative
icons and pair with a real accessible label elsewhere. Use `size-5` for inline icons,
`size-11` for touch/icon-button targets.

## Radius & Spacing

Tokenized radii (`--radius: 0.75rem`):
- `rounded-sm` = `calc(--radius - 0.5rem)` (0.25rem)
- `rounded-md` = `calc(--radius - 0.25rem)` (0.5rem)
- `rounded-lg` = `--radius` (0.75rem) — **default for buttons/inputs**
- `rounded-xl` = `calc(--radius + 0.25rem)` (1rem)
- `rounded-2xl` — **default for cards, dialogs, panels**

Cards use `p-5` gutters (`CardHeader`, `CardContent`), dialog content `p-6`.

## Surfaces: Solid vs Glass

- **Solid** `bg-card` is the default for cards (`Card` with `glass={false}`) and
  dialogs.
- **Glass** (`glass`, `bg-card/70 backdrop-blur-md`) is reserved for surfaces that
  should read as *raised*: overlays on content, sidebar chrome (`--side`), floating
  panels. Translucent white in light, elevated dark in dark mode, with an inset
  specular top edge `shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]`.
- Dense surfaces use `bg-background/80` / `bg-muted` with `border-border/40`.

## Motion & Easing

Motion uses `motion/react` + `AnimatePresence`, gated with `useReducedMotion()`.
Standard token for UI surfaces (documented project-wide):

- **Primary surface easing:** `transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]`
- **Dialogs/overlays:** `duration-0.15s`, `opacity` + `scale(0.96→1)`
- **Collapsible/disclosure:** `duration-0.2s`, `easeInOut`
- **Interactive:** `transition-all duration-200 ease-out`, `active:scale-[0.98]`

Global `prefers-reduced-motion` neuters non-essential animation in `globals.css` —
always rely on it rather than adding ad-hoc disable logic.

## Touch Targets & Accessibility

- **Minimum interactive target: 44×44px** — `min-h-11` / `min-w-11`, `h-11`, or
  `size-11`. Small `sm` buttons are `h-9` and must only be used where a 44px target
  is impractical (dense toolbars); keep adequate spacing.
- **Focus rings:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
  focus-visible:ring-offset-2` on every interactive element.
- **Keyboard:** Radix primitives handle arrows, focus trap, and Esc — do not re-implement.
- Use `aria-expanded`/`aria-controls` for disclosure, `role="region"`/`aria-labelledby`
  for panels, `role="alert"` / `aria-live` for status changes, and `aria-label` for
  icon-only controls (e.g. the dialog close button).

## Layout & Responsiveness

- **Responsive and mobile-first by default.** Stack on small viewports, expand on
  `sm`/`md` (e.g. `DialogFooter` uses `flex-col-reverse sm:flex-row`).
- **Container queries:** add `.cq { container-type: inline-size }` to a parent so
  nested components (e.g. itinerary boards, day columns) respond to their own width,
  not only the viewport.
- **Progressive disclosure for complex data:** prefer `Collapsible` panels, Radix
  `Tabs`, or `Dialog`/drawers over showing everything at once. Keep default views
  scannable; reveal detail on demand.

## Component Inventory (`components/ui/`)

Reuse these before building anything new:

| Component | Backing | Notes |
|---|---|---|
| `Button` | cva + Radix `Slot` | Variants: primary/default/secondary/destructive/outline/ghost/link; `size-11` icon |
| `Card` (`CardHeader/Title/Description/Content`) | custom | `glass` prop for raised surfaces |
| `Dialog` family | Radix `Dialog` + `motion` | Overlay + animated content; `size-11` close button |
| `DropdownMenu` | Radix `DropdownMenu` | Use instead of a custom menu |
| `Tabs` | Radix `Tabs` | For segmented/progressive disclosure |
| `Label` | Radix `Label` | Form field labels |
| `Input` | custom | Form inputs |
| `Badge` | custom | Status/labels |
| `Heading` | custom | Typographic heading |
| `Collapsible` | custom (motion) | **Accessible progressive-disclosure primitive** (`aria-expanded`/`aria-controls`/`role="region"`) |
| `IconTile`, `AvatarPicker`, `UserAvatar` | custom + DiceBear | Media/identity |

> Note: `Collapsible` is a custom wrapper, not Radix. When the spec says "reuse the
> existing primitive," that means reuse these `components/ui/*` wrappers regardless
> of whether they are Radix-backed or custom.

## Verification

- UI changes require a Vitest rendering/interaction test (see
  [`../skills/ui-component-generator.md`](../skills/ui-component-generator.md), Phase 4).
- Run `pnpm lint`, `pnpm typecheck`, and the relevant `pnpm test`.
- Verify against `prefers-reduced-motion` and a mobile viewport.
- Do not hardcode colors, radii, or type sizes that have a token — use the token.
