---
name: i18n-checker
description: Flag raw unlocalized copy in TSX and confirm every key exists in both en and es
allowed-tools:
  - read
  - grep
  - glob
  - exec
---

Run:

```bash
pnpm agent:audit-i18n
# or: bash .agents/skills/i18n-audit.sh            (changed files vs HEAD)
#     bash .agents/skills/i18n-audit.sh --all      (whole repo sweep)
```

The script strips comments, then flags literal copy in user-facing attributes
(`placeholder`, `title`, `alt`, `aria-label`, `aria-description`, `label`) and in
JSX text nodes. It then runs `lib/i18n/i18n-coverage.test.ts`, which parses the
copy files with the TypeScript AST and enforces `en`/`es` key parity plus usage.

Fix by moving the string into `lib/i18n/frontend-copy.ts` under both `en` and
`es` and reading it with `t("key")`. Spanish is written, not machine-translated.
Use `{{placeholders}}`, never concatenation. `--warn` reports without failing.
