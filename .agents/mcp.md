# MCP servers for this repository

`mcp.json` (repo root) is the portable manifest. `.cursor/mcp.json` carries the
same entries in the format Cursor reads. Nothing here contains a secret: no `env`
block, no tokens. Keys belong in the client's user-level config or its local,
gitignored override.

## Servers

| Name | Package (pinned) | Transport | What it is for |
|---|---|---|---|
| `playwright` | `@playwright/mcp@0.0.84` | stdio | drive the running app, read the accessibility tree, screenshot a route at 430/1280px |
| `git` | `@cyanheads/git-mcp-server@2.15.3` | stdio | structured `status` / `diff` / `log` / `blame` instead of parsing porcelain output |
| `codegraph` | `@astudioplus/codegraph-mcp@0.21.0` | stdio | symbol graph over the repo: callers, callees, impact — avoids reading whole files to trace a chain |

## Three requested packages do not exist (verified 2026-11-02)

The names in the original task returned **404** from the npm registry, so they
were replaced with working equivalents rather than shipped as dead config:

| Requested | Registry result | Shipped |
|---|---|---|
| `@codegraph/mcp-server` | 404 | `@astudioplus/codegraph-mcp@0.21.0` |
| `@modelcontextprotocol/server-git` | 404 | `@cyanheads/git-mcp-server@2.15.3` |
| `@modelcontextprotocol/server-playwright` | 404 | `@playwright/mcp@0.0.84` |

The official git server exists but is Python-only (`uvx mcp-server-git`), and `uv`
is not installed in this environment.

## Trust levels — read before enabling

- **`playwright`** — Microsoft, first party, same vendor as `@playwright/test`
  already in `devDependencies`. Low risk.
- **`git`** — third party (`cyanheads`), Apache-2.0, runs the local `git` CLI
  through `cross-spawn`. It can commit and rewrite branches if you ask it to.
  Agents must still follow `AGENTS.md` §8 (no force-push, no history rewrite).
- **`codegraph`** — third party, and the **highest cost to trust**: on install it
  downloads a native analysis engine from GitHub releases and verifies it against
  a published `.sha256`. The engine is not in the npm tarball. If that is not
  acceptable, drop this one server — the other two plus `rg`/`grep` cover the same
  ground, slower.

Exact version pins (`@x.y.z`, never `latest`, never bare `-y pkg`) mean a
compromised new release cannot be pulled in silently. Bump deliberately, after
reading the changelog.

## What was actually run (2026-11-02)

| Server | Smoke test | Result |
|---|---|---|
| `playwright` | `npx @playwright/mcp@0.0.84 --help` | starts; `--headless` and `--isolated` confirmed as real flags |
| `git` | MCP `initialize` + `tools/list` over stdio | responded with 28 tools; `@cyanheads/git-mcp-server 2.15.3` on Node 26 |
| `codegraph` | **not run** | flags taken from the published README (`--workspace`, `--profile`, `--graph-only`); the native engine is downloaded on first start, which was deliberately not triggered here |

`--isolated` keeps the Playwright browser profile in memory, so an agent session
cannot read or overwrite the developer's real Chrome profile.

## Devin CLI

Devin CLI reads project servers from `.devin/mcp_config.json`, which this
repository does not ship (the file was deliberately not added). To use these
servers there, either point the client at `mcp.json` or import the entries once:

```bash
devin mcp add -s project playwright -- npx -y @playwright/mcp@0.0.84 --headless --isolated
devin mcp add -s project git -- npx -y @cyanheads/git-mcp-server@2.15.3
devin mcp add -s project codegraph -- npx -y @astudioplus/codegraph-mcp@0.21.0 --workspace . --profile graph --graph-only
```

## Disabling a server

- Devin CLI: `devin mcp disable codegraph` (or set `"disabled": true` on the entry
  once the server is registered in `.devin/mcp_config.json`).
- Cursor: delete the entry from `.cursor/mcp.json`.
- Any client: remove the entry from `mcp.json`.

## Not configured on purpose

- **No `env` blocks and no API keys.** Adding one means adding a secret to a
  tracked file; use the client's user-level config instead.
- **No write-capable database server.** Supabase access for agents goes through
  the CLI and the local stack, not through an MCP tool that can mutate remote data.
