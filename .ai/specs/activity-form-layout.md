# Activity form layout

**Status:** Complete  
**Type:** UI/UX refactor (no domain, validation, or submit changes)

## Problem

The activity edit modal stacked Must-dos and day/time on the left, leaving a tall empty column on the right. Footer actions competed: a solid red delete, a labeled clone, and a gradient save.

## Layout

- **Zone A (two columns):** left = category, title, description. Right = location, budget, vote, day, and time controls.
- **Zone B (full width):** Must-dos, then a single Participants block (attendee chips + manual add).
- Clone is a header icon next to the dialog close control, not a footer button.
- Delete is ghost/outline with destructive text. Save is solid `primary` (no magenta→red gradient).
- Participants and vote groups use a muted fill instead of dashed or heavy borders.

## Localization

Activity form labels resolve through `common.*` (and `copy.*` / `errors.*` via the shared translator). Spanish: Título, Descripción, Hora exacta, Hora de inicio, Hora de fin, Participantes.
