---
name: git-session-closer
description: Close an agent turn — verification gate, domain guards, deduped memory entry, conventional commit
allowed-tools:
  - read
  - grep
  - glob
  - exec
  - write
---

Read `.agents/skills/session-close.md` and run the steps in order. Stop at the
first failure and report it.

```bash
pnpm agent:verify                       # lint + typecheck + test  (add pnpm build for routing/schema)
pnpm agent:schema                       # additive migrations + outbox writes
pnpm agent:audit-i18n                   # raw copy + en/es parity
bash .agents/skills/test-runner.sh      # affected suites
```

Then, before you answer:

1. Update `memory/MEMORY.md` — one dated entry at the top of §7
   (`Changed` / `Schema` / `Verification` / `Gotchas`), bump `Last updated`.
   Dedupe: update an existing entry instead of adding a near-duplicate.
2. Update the topic file whose subject changed (`data-models.md`,
   `components-ui.md`, `roles-abilities.md`) and `.ai/CONTEXT.md` if the stack or
   a feature changed.
3. Write a conventional commit message that explains the **why**:
   `<type>(<scope>): <imperative summary>`.

Report only commands that actually ran, with their numbers. Never commit with
nothing staged, never push unless asked, never rewrite pushed history, never
delete tests or copy to make a gate pass.
