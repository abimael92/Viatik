# Activity form layout

**Status:** Complete  
**Type:** UI/UX refactor (no domain, validation, or submit changes)

## Problem

A two-column activity modal stacked too many fields, hid later sections, and left an unbalanced empty column.

## Layout

The dialog title and footer stay outside the tabs. The tab strip uses a blue → magenta → amber track. Each trigger has its own two-stop gradient when active (sky, fuchsia, amber). Inner activity fields use three tabs:

- **Details:** category, title, description, location, lodging reservation (when applicable), day, time specificity, start/end or flexible period.
- **Group & money:** optional personal budget, send to group vote, and a single Participants block (attendee chips + manual add).
- **Extras:** Attachments (photos, links, location pins) and Must-dos at full width.

Section fills are a simple muted surface with a border. Selected participant chips use a white card and a primary border so they stay readable on the section.

Transit still replaces the tabbed body after category is set to Transit. Hidden tab panels stay mounted so submit still reads every field.

## Actions and styling

- Clone is a header icon next to the dialog close control.
- Delete is ghost with destructive text.
- Save is solid `primary` (no magenta→red gradient).
- Sections use a muted fill and a light border. Selected chips use a primary border.

## Localization

Tab labels: Details / Detalles, Extras, Group & money / Grupo y finanzas. Field labels stay on `common.*`.
