#!/usr/bin/env node
/**
 * AI-infrastructure validator.
 *
 * Checks the assets that tell an agent how to work in this repository — not the
 * application. Nothing here re-implements a product gate: `pnpm agent:verify`,
 * `verify-schema.ts` and `i18n-audit.sh` stay the authorities for code.
 *
 *   node .ai/infra/scripts/validate-infra.mjs            # all checks
 *   node .ai/infra/scripts/validate-infra.mjs --json     # machine-readable
 *   node .ai/infra/scripts/validate-infra.mjs --probe    # + MCP availability (opt-in, network)
 *   node .ai/infra/scripts/validate-infra.mjs --skills   # one section only
 *
 * Exit 0 = clean (warnings allowed), 1 = error, 2 = the validator itself failed.
 * Read-only. Never rewrites a document, a skill, or a manifest.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ROOT,
  exists,
  fileStats,
  finding,
  gitFiles,
  isMain,
  listDirs,
  markdownLinks,
  parseArgs,
  parseFrontmatter,
  readJson,
  readText,
  report,
  resolveLink,
} from "./lib.mjs";

const REQUIRED_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".ai/llms.txt",
  ".ai/constitution.md",
  ".ai/AGENTS.md",
  ".ai/CONTEXT.md",
  ".ai/templates/feature-spec.md",
  ".ai/templates/bug-report.md",
  ".ai/specs/bug-ledger.md",
  "memory/MEMORY.md",
  "memory/data-models.md",
  "memory/components-ui.md",
  "memory/roles-abilities.md",
  ".agents/skills/README.md",
  ".agents/mcp.md",
  "mcp.json",
  "skills-lock.json",
];

/** Agent-instruction documents whose internal links must resolve. */
const LINKED_DOCS = [
  "AGENTS.md",
  "CLAUDE.md",
  ".ai/llms.txt",
  ".ai/constitution.md",
  ".ai/AGENTS.md",
  ".ai/CONTEXT.md",
  ".ai/QUICKSTART.md",
  "memory/MEMORY.md",
  ".agents/skills/README.md",
  ".agents/mcp.md",
];

const LOCAL_SKILLS = new Set([
  "spec-first-design",
  "dexie-schema-guardian",
  "i18n-checker",
  "visual-ui-reviewer",
  "smart-test-runner",
  "git-session-closer",
]);

/**
 * Local cards are the source of truth; the `SKILL.md` wrapper is the
 * agent-discoverable pointer. Mapping is by contract, not by guesswork.
 */
const CARD_TO_WRAPPER = {
  "spec-design.md": "spec-first-design",
  "db-guardian.md": "dexie-schema-guardian",
  "ui-standards.md": "visual-ui-reviewer",
  "session-close.md": "git-session-closer",
};

const ALLOWED_TOOLS = new Set(["read", "grep", "glob", "exec", "write", "edit", "bash", "webfetch"]);

function checkRequiredFiles() {
  const findings = [];
  for (const file of REQUIRED_FILES) {
    if (!exists(file)) {
      findings.push(
        finding({
          code: "missing-file",
          file,
          message: "required agent-instruction file is missing",
          hint: "restore the file or update REQUIRED_FILES in validate-infra.mjs if it was renamed on purpose",
        })
      );
    }
  }
  return findings;
}

function checkLinks() {
  const findings = [];
  for (const doc of LINKED_DOCS) {
    if (!exists(doc)) continue;
    for (const link of markdownLinks(readText(doc))) {
      const resolved = resolveLink(doc, link.target);
      if (resolved === null) continue;
      if (!exists(resolved)) {
        findings.push(
          finding({
            code: "broken-link",
            file: doc,
            line: link.line,
            message: `link target does not exist: ${link.target} → ${resolved}`,
            hint: "fix the path; do not delete the reference unless the target was removed on purpose",
          })
        );
      }
    }
  }
  return findings;
}

function checkBridges() {
  const findings = [];
  if (exists("CLAUDE.md")) {
    const source = readText("CLAUDE.md");
    for (const required of ["@AGENTS.md", "@memory/MEMORY.md"]) {
      if (!source.includes(required)) {
        findings.push(
          finding({
            code: "bridge-import",
            file: "CLAUDE.md",
            message: `compatibility bridge must import ${required}`,
          })
        );
      }
    }
  }
  if (exists("AGENTS.md")) {
    const source = readText("AGENTS.md");
    if (!/<!-- BEGIN:nextjs-agent-rules -->[\s\S]*<!-- END:nextjs-agent-rules -->/.test(source)) {
      findings.push(
        finding({
          code: "agent-block",
          file: "AGENTS.md",
          message: "the nextjs-agent-rules block is missing or malformed",
          hint: "restore it verbatim; `next dev` re-adds it and the uncommitted diff is noise",
        })
      );
    }
  }
  return findings;
}

function checkSkills() {
  const findings = [];
  const dirs = listDirs(".agents/skills").filter((dir) => exists(`${dir}/SKILL.md`));

  const wrappers = new Set();
  for (const dir of dirs) {
    const wrapper = `${dir}/SKILL.md`;
    wrappers.add(path.posix.basename(dir));
    const { data, body, error } = parseFrontmatter(readText(wrapper));
    if (error || !data) {
      findings.push(
        finding({ code: "skill-frontmatter", file: wrapper, message: "SKILL.md has no YAML frontmatter" })
      );
      continue;
    }
    const name = path.posix.basename(dir);
    if (data.name !== name) {
      findings.push(
        finding({
          code: "skill-name",
          file: wrapper,
          line: 2,
          message: `frontmatter name "${data.name ?? ""}" does not match directory "${name}"`,
        })
      );
    }
    if (typeof data.description !== "string" || data.description.trim().length < 20) {
      findings.push(
        finding({
          code: "skill-description",
          file: wrapper,
          line: 3,
          message: "frontmatter description is missing or too short to trigger discovery",
        })
      );
    }
    if (data["allowed-tools"] !== undefined) {
      if (!Array.isArray(data["allowed-tools"]) || data["allowed-tools"].length === 0) {
        findings.push(
          finding({
            code: "skill-tools",
            file: wrapper,
            line: 4,
            message: "allowed-tools must be a non-empty list",
          })
        );
      } else {
        for (const tool of data["allowed-tools"]) {
          if (!ALLOWED_TOOLS.has(tool)) {
            findings.push(
              finding({
                code: "skill-tools",
                file: wrapper,
                line: 4,
                message: `unknown tool "${tool}" in allowed-tools`,
                hint: `known tools: ${[...ALLOWED_TOOLS].join(", ")}`,
              })
            );
          }
        }
      }
    }
    if (body.trim().length < 20) {
      findings.push(
        finding({ code: "skill-body", file: wrapper, message: "SKILL.md body is empty; the wrapper must point somewhere" })
      );
    }
  }

  for (const [card, wrapper] of Object.entries(CARD_TO_WRAPPER)) {
    if (exists(`.agents/skills/${card}`) && !wrappers.has(wrapper)) {
      findings.push(
        finding({
          code: "skill-missing-wrapper",
          file: `.agents/skills/${card}`,
          message: `card has no discoverable wrapper at .agents/skills/${wrapper}/SKILL.md`,
        })
      );
    }
  }
  return findings;
}

/**
 * Only shell scripts that a package script actually executes need +x. Template
 * scripts shipped by third-party skills are documentation, not entry points.
 */
function checkScriptPermissions() {
  const findings = [];
  const pkg = readJson("package.json");
  const executed = new Set();
  for (const command of Object.values(pkg?.scripts ?? {})) {
    const tokens = String(command).split(/\s+/);
    tokens.forEach((token, index) => {
      if (!token.endsWith(".sh") || token.startsWith("-")) return;
      // `bash foo.sh` does not need +x; a bare `foo.sh` does.
      if (["bash", "sh", "zsh", "source", "."].includes(tokens[index - 1] ?? "")) return;
      executed.add(token);
    });
  }
  for (const file of executed) {
    const stats = fileStats(file);
    if (stats && (stats.mode & 0o111) === 0) {
      findings.push(
        finding({
          code: "script-not-executable",
          file,
          message: "shell script invoked by a package script is not executable",
          hint: `chmod +x ${file}`,
        })
      );
    }
  }
  return findings;
}

function checkPackageScripts() {
  const findings = [];
  const pkg = readJson("package.json");
  if (!pkg?.scripts) {
    return [finding({ code: "package-json", file: "package.json", message: "package.json has no scripts block" })];
  }
  for (const [name, command] of Object.entries(pkg.scripts)) {
    for (const token of String(command).split(/\s+/)) {
      if (!/\.(?:ts|tsx|mjs|cjs|js|sh)$/.test(token)) continue;
      if (token.startsWith("-")) continue;
      if (!exists(token)) {
        findings.push(
          finding({
            code: "script-missing",
            file: "package.json",
            message: `script "${name}" points at a missing file: ${token}`,
          })
        );
      }
    }
  }
  return findings;
}

function checkSkillLock() {
  const findings = [];
  const lock = readJson("skills-lock.json");
  if (!lock?.skills || typeof lock.skills !== "object") {
    return [finding({ code: "lock-shape", file: "skills-lock.json", message: "missing `skills` object" })];
  }
  for (const [name, entry] of Object.entries(lock.skills)) {
    for (const field of ["source", "sourceType", "skillPath", "computedHash"]) {
      if (!entry?.[field]) {
        findings.push(
          finding({
            code: "lock-shape",
            file: "skills-lock.json",
            message: `skill "${name}" is missing ${field}; provenance cannot be audited`,
          })
        );
      }
    }
    if (entry?.computedHash && !/^[a-f0-9]{64}$/.test(entry.computedHash)) {
      findings.push(
        finding({
          code: "lock-shape",
          file: "skills-lock.json",
          message: `skill "${name}" computedHash is not a 64-character hex digest`,
        })
      );
    }
    if (!exists(`.agents/skills/${name}/SKILL.md`)) {
      findings.push(
        finding({
          code: "lock-missing-skill",
          file: "skills-lock.json",
          message: `pinned skill "${name}" has no .agents/skills/${name}/SKILL.md`,
          hint: "reinstall it with `npx skills add` or remove the lock entry deliberately",
        })
      );
    }
  }
  for (const dir of listDirs(".agents/skills")) {
    if (!exists(`${dir}/SKILL.md`)) continue;
    const name = path.posix.basename(dir);
    if (!lock.skills[name] && !LOCAL_SKILLS.has(name)) {
      findings.push(
        finding({
          code: "lock-orphan",
          file: `${dir}/SKILL.md`,
          severity: "warn",
          message: `skill "${name}" is installed but not pinned in skills-lock.json`,
          hint: "add it to the lockfile or to LOCAL_SKILLS in validate-infra.mjs if it ships with this repository",
        })
      );
    }
  }
  return findings;
}

function readManifests() {
  return {
    root: readJson("mcp.json"),
    cursor: readJson(".cursor/mcp.json"),
  };
}

function checkMcpConfig() {
  const findings = [];
  const { root, cursor } = readManifests();
  if (!root?.mcpServers) {
    return [finding({ code: "mcp-config", file: "mcp.json", message: "missing mcpServers object" })];
  }
  for (const [name, server] of Object.entries(root.mcpServers)) {
    if (!server.command) {
      findings.push(finding({ code: "mcp-config", file: "mcp.json", message: `server "${name}" has no command` }));
    }
    if (!Array.isArray(server.args)) {
      findings.push(finding({ code: "mcp-config", file: "mcp.json", message: `server "${name}" has no args array` }));
      continue;
    }
    if (server.env && Object.keys(server.env).length > 0) {
      findings.push(
        finding({
          code: "mcp-secret",
          file: "mcp.json",
          message: `server "${name}" declares env values; the tracked manifest must stay secret-free`,
          hint: "move credentials to the client's user-level config",
        })
      );
    }
    for (const arg of server.args) {
      if (!/^(@[\w.-]+\/)?[\w.-]+@/.test(arg)) continue;
      if (!/@\d+\.\d+\.\d+$/.test(arg)) {
        findings.push(
          finding({
            code: "mcp-unpinned",
            file: "mcp.json",
            message: `server "${name}" is not pinned to an exact version: ${arg}`,
            hint: "use name@x.y.z — never latest, never a bare package name",
          })
        );
      }
    }
  }

  if (!cursor?.mcpServers) {
    findings.push(finding({ code: "mcp-config", file: ".cursor/mcp.json", message: "missing mcpServers object" }));
    return findings;
  }
  const rootNames = Object.keys(root.mcpServers).sort();
  const cursorNames = Object.keys(cursor.mcpServers).sort();
  if (rootNames.join(",") !== cursorNames.join(",")) {
    findings.push(
      finding({
        code: "mcp-parity",
        file: ".cursor/mcp.json",
        message: `server list differs from mcp.json (${cursorNames.join(", ")} vs ${rootNames.join(", ")})`,
      })
    );
  }
  for (const name of rootNames) {
    if (!cursor.mcpServers[name]) continue;
    const a = JSON.stringify(root.mcpServers[name]);
    const b = JSON.stringify(cursor.mcpServers[name]);
    if (a !== b) {
      findings.push(
        finding({
          code: "mcp-parity",
          file: ".cursor/mcp.json",
          message: `server "${name}" is configured differently from mcp.json`,
          hint: "keep mcp.json as the source of truth and mirror it",
        })
      );
    }
  }
  return findings;
}

/** Opt-in: ask each pinned package for `--help`. Never starts a server. */
function probeMcpServers() {
  const findings = [];
  const { root } = readManifests();
  for (const [name, server] of Object.entries(root?.mcpServers ?? {})) {
    const spec = (server.args ?? []).find((arg) => /^(@[\w.-]+\/)?[\w.-]+@\d+\.\d+\.\d+$/.test(arg));
    if (!spec) continue;
    try {
      execFileSync("npx", ["-y", spec, "--help"], { cwd: ROOT, timeout: 120_000, stdio: "ignore" });
      process.stdout.write(`  ok    ${name}: ${spec} responds to --help\n`);
    } catch {
      findings.push(
        finding({
          code: "mcp-probe",
          file: "mcp.json",
          severity: "warn",
          message: `server "${name}" (${spec}) did not answer --help (network or registry unavailable?)`,
        })
      );
    }
  }
  return findings;
}

/**
 * Provenance listing: what is installed, from where, and whether the pinned
 * entry still has a local copy. The Skills CLI's `computedHash` is recorded but
 * not recomputed — its algorithm is not reproducible locally (checked
 * 2026-11-03), so this reports provenance instead of claiming integrity.
 */
function printProvenance() {
  const lock = readJson("skills-lock.json");
  const entries = Object.entries(lock?.skills ?? {});
  if (entries.length === 0) {
    process.stdout.write("· no pinned external skills\n");
    return;
  }
  process.stdout.write(`· skill provenance — ${entries.length} pinned skill(s)\n`);
  for (const [name, entry] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    const installed = exists(`.agents/skills/${name}/SKILL.md`) ? "installed" : "MISSING";
    process.stdout.write(
      `  ${name.padEnd(34)} ${installed.padEnd(10)} ${entry.source}/${entry.skillPath} (hash ${String(entry.computedHash).slice(0, 12)}…)\n`
    );
  }
  process.stdout.write("  · hash is the Skills CLI's own digest; it is not recomputed locally\n");
}

export function run({ probe = false, sections = null } = {}) {
  const enabled = (section) => !sections || sections.includes(section);
  const findings = [];
  if (enabled("files")) findings.push(...checkRequiredFiles());
  if (enabled("links")) findings.push(...checkLinks());
  if (enabled("bridges")) findings.push(...checkBridges());
  if (enabled("skills")) findings.push(...checkSkills());
  if (enabled("scripts")) findings.push(...checkPackageScripts());
  if (enabled("scripts")) findings.push(...checkScriptPermissions());
  if (enabled("lock")) findings.push(...checkSkillLock());
  if (enabled("mcp")) findings.push(...checkMcpConfig());
  if (probe) findings.push(...probeMcpServers());
  return findings;
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2), { booleans: ["json", "probe", "provenance", "help"] });
  if (flags.help) {
    process.stdout.write(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n/, "") + "\n");
    return;
  }
  if (flags.provenance === true && flags.json !== true) printProvenance();
  const sections = ["files", "links", "bridges", "skills", "scripts", "lock", "mcp"].filter(
    (section) => flags[section] === true
  );
  const findings = run({ probe: flags.probe === true, sections: sections.length > 0 ? sections : null });
  process.exitCode = report({
    title: `infrastructure validation — ${gitFiles().length} tracked files`,
    findings,
    success: "agent instructions, skills, lockfile and MCP manifest are consistent",
    json: flags.json === true,
  });
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`✖ validator crashed: ${error?.stack ?? error}\n`);
    process.exit(2);
  }
}
