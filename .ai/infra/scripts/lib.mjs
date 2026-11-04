#!/usr/bin/env node
/**
 * Shared helpers for the `.ai/infra` governance scripts.
 *
 * Node builtins only, no dependencies, macOS/Linux/Windows safe (no shell
 * pipelines, no `find`, no `rg`). Every script under `.ai/infra/scripts/`
 * imports from here so path resolution, frontmatter parsing, markdown link
 * extraction and glob overlap behave identically everywhere.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Repository root — `.ai/infra/scripts/` is three levels down. Falls back to the
 * working directory when the module is loaded by a test runner whose
 * `import.meta.url` is not a file URL (Vitest transforms it).
 */
function repositoryRoot() {
  try {
    const url = new URL("../../../", import.meta.url);
    if (url.protocol === "file:") return path.resolve(fileURLToPath(url));
  } catch {
    // fall through
  }
  return process.cwd();
}

export const ROOT = repositoryRoot();

export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".worktrees",
  ".playwright-mcp",
  "coverage",
  "test-results",
  "playwright-report",
  "dist",
  "build",
  "out",
]);

/** POSIX-style path relative to the repository root. */
export function rel(file) {
  return path.relative(ROOT, path.resolve(ROOT, file)).split(path.sep).join("/");
}

export function abs(file) {
  return path.isAbsolute(file) ? file : path.join(ROOT, file);
}

export function exists(file) {
  return existsSync(abs(file));
}

export function readText(file) {
  return readFileSync(abs(file), "utf8");
}

/** Returns null instead of throwing so callers can report a finding. */
export function readJson(file) {
  try {
    return JSON.parse(readText(file));
  } catch {
    return null;
  }
}

/** Immediate child directories of `dir`, repository-relative. */
export function listDirs(dir) {
  try {
    return readdirSync(abs(dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !SKIP_DIRS.has(entry.name))
      .map((entry) => rel(path.join(abs(dir), entry.name)))
      .sort();
  } catch {
    return [];
  }
}

export function listFiles(dir, { extensions = null, recursive = true } = {}) {
  const start = abs(dir);
  const out = [];
  const visit = (current) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".github") continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive) visit(full);
      } else if (entry.isFile()) {
        if (!extensions || extensions.some((extension) => entry.name.endsWith(extension))) {
          out.push(rel(full));
        }
      }
    }
  };
  visit(start);
  return out.sort();
}

/**
 * Minimal YAML frontmatter reader: enough for skill metadata (`name`,
 * `description`, `allowed-tools` lists, `license`). Nested objects are not
 * supported on purpose — a skill that needs them is out of contract.
 */
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: null, body: text, error: "missing frontmatter" };

  const data = {};
  let key = null;
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && key) {
      const value = unquote(item[1].trim());
      data[key] = Array.isArray(data[key]) ? [...data[key], value] : [value];
      continue;
    }
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (pair) {
      key = pair[1];
      const value = pair[2].trim();
      data[key] = value === "" ? [] : unquote(value);
    }
  }
  return { data, body: text.slice(match[0].length), error: null };
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** `--flag`, `--key value`, `--key=value`, and `--` passthrough. */
export function parseArgs(argv, { booleans = [] } = {}) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const equals = body.indexOf("=");
    if (equals !== -1) {
      flags[body.slice(0, equals)] = body.slice(equals + 1);
      continue;
    }
    if (booleans.includes(body) || argv[i + 1] === undefined || argv[i + 1].startsWith("--")) {
      flags[body] = true;
      continue;
    }
    flags[body] = argv[i + 1];
    i += 1;
  }
  return { flags, positional };
}

/**
 * Markdown links outside fenced code blocks. Returns `{ text, target, line }`.
 * Reference-style links and HTML anchors are intentionally not parsed.
 */
export function markdownLinks(source) {
  const links = [];
  let fenced = false;
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const pattern = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let match = pattern.exec(line);
    while (match) {
      links.push({ text: match[1], target: match[2], line: index + 1 });
      match = pattern.exec(line);
    }
  }
  return links;
}

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/**
 * Resolves a markdown link target to a repository-relative path, or null when
 * the link is external, an in-page anchor, or a protocol handler.
 */
export function resolveLink(fromFile, target) {
  if (!target || EXTERNAL.test(target)) return null;
  const withoutAnchor = target.split("#")[0];
  if (!withoutAnchor) return null;
  const decoded = decodeURIComponent(withoutAnchor);
  const resolved = path.resolve(path.dirname(abs(fromFile)), decoded);
  return rel(resolved);
}

export function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i += 1;
        if (glob[i + 1] === "/") i += 1;
      } else {
        out += "[^/]*";
      }
    } else if (char === "?") {
      out += "[^/]";
    } else {
      out += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

/** Literal text before the first wildcard. */
export function globPrefix(glob) {
  const wildcard = glob.search(/[*?]/);
  return wildcard === -1 ? glob : glob.slice(0, wildcard);
}

/**
 * Conservative overlap test for two ownership globs. Two patterns overlap when
 * one literal prefix is a prefix of the other, or when either pattern matches
 * the other's literal prefix. Errs toward "overlap" so two agents cannot claim
 * the same file silently.
 */
export function globsOverlap(a, b) {
  const prefixA = globPrefix(a);
  const prefixB = globPrefix(b);
  if (prefixA.startsWith(prefixB) || prefixB.startsWith(prefixA)) return true;
  return globToRegExp(a).test(prefixB) || globToRegExp(b).test(prefixA);
}

/** Tracked plus untracked (not ignored) files, repository-relative. */
export function gitFiles() {
  try {
    const run = (args) =>
      execFileSync("git", args, { cwd: ROOT, encoding: "utf8" })
        .split("\0")
        .filter(Boolean);
    return [...new Set([...run(["ls-files", "-z"]), ...run(["ls-files", "--others", "--exclude-standard", "-z"])])].sort();
  } catch {
    return listFiles(ROOT);
  }
}

/** Changed, staged and untracked files relative to `base`. */
export function changedFiles(base = "HEAD") {
  const run = (args) => {
    try {
      return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" })
        .split("\n")
        .filter(Boolean);
    } catch {
      return [];
    }
  };
  return [
    ...new Set([
      ...run(["diff", "--name-only", base]),
      ...run(["diff", "--cached", "--name-only"]),
      ...run(["ls-files", "--others", "--exclude-standard"]),
    ]),
  ].sort();
}

export function isMain(metaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  return pathToFileURL(path.resolve(entry)).href === metaUrl;
}

/**
 * A finding is `{ code, file, line?, message, hint?, severity }`. Severity is
 * `error` (exit 1), `warn` (printed), or `known` (baselined, printed).
 */
export function finding({ code, file, line, message, hint, severity = "error" }) {
  return { code, file, line, message, hint, severity };
}

export function formatFinding(item) {
  const location = item.line ? `${item.file}:${item.line}` : item.file;
  return `${location} — ${item.message}`;
}

/**
 * Prints grouped findings and returns the process exit code. Errors fail;
 * warnings and baselined findings do not.
 */
export function report({ title, findings, success, json = false }) {
  const errors = findings.filter((item) => item.severity === "error");
  const warnings = findings.filter((item) => item.severity === "warn");
  const known = findings.filter((item) => item.severity === "known");

  if (json) {
    process.stdout.write(
      `${JSON.stringify({ title, ok: errors.length === 0, errors, warnings, known }, null, 2)}\n`
    );
    return errors.length === 0 ? 0 : 1;
  }

  process.stdout.write(`· ${title}\n`);
  for (const group of [
    { label: "KNOWN", items: known },
    { label: "WARN", items: warnings },
    { label: "ERROR", items: errors },
  ]) {
    for (const item of group.items) {
      process.stdout.write(`  ${group.label.padEnd(5)} ${formatFinding(item)}\n`);
      if (item.hint) process.stdout.write(`        ↳ ${item.hint}\n`);
    }
  }

  if (errors.length === 0) {
    process.stdout.write(
      `✔ ${success ?? "clean"}${known.length ? ` (${known.length} known finding(s))` : ""}\n`
    );
    return 0;
  }
  process.stderr.write(`\n✖ ${errors.length} error(s)\n`);
  return 1;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function fileStats(file) {
  try {
    return statSync(abs(file));
  } catch {
    return null;
  }
}
