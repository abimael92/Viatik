#!/usr/bin/env node
/**
 * Security and supply-chain audit for the agent layer.
 *
 * Covers the risks that the application gates do not see: secrets in tracked
 * files, unpinned MCP packages, skill provenance, executable shell snippets, and
 * over-broad skill tool permissions.
 *
 *   node .ai/infra/scripts/security-audit.mjs
 *   node .ai/infra/scripts/security-audit.mjs --json
 *
 * Findings print `file:line` and a pattern name — never the matched value.
 * Exit 0 = clean (warnings allowed), 1 = a finding that needs action.
 */
import {
  exists,
  finding,
  gitFiles,
  isMain,
  parseArgs,
  parseFrontmatter,
  readJson,
  readText,
  report,
} from "./lib.mjs";

/** High-signal credential shapes. Deliberately narrow to avoid crying wolf. */
const SECRET_PATTERNS = [
  { name: "openai-key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "github-pat", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "supabase-service-role", pattern: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*eyJ/ },
  { name: "literal-jwt", pattern: /eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}/ },
];

const UNSAFE_SHELL = [
  { name: "curl-pipe-shell", pattern: /curl[^\n|]*\|\s*(?:ba|z|)sh\b/ },
  { name: "wget-pipe-shell", pattern: /wget[^\n|]*\|\s*(?:ba|z|)sh\b/ },
  { name: "recursive-root-delete", pattern: /rm\s+-rf\s+\/(?:\s|$)/ },
  { name: "force-push", pattern: /git\s+push\s+[^\n]*--force/ },
  { name: "sudo", pattern: /\bsudo\s+/ },
  { name: "world-writable", pattern: /chmod\s+(?:-R\s+)?777\s+/ },
  { name: "curl-eval", pattern: /eval\s+"?\$\(curl/ },
];

const SKIP_PREFIXES = [
  "node_modules/",
  ".git/",
  ".next/",
  "coverage/",
  "test-results/",
  "playwright-report/",
  ".playwright-mcp/",
  ".worktrees/",
  "android/",
  "ios/App/Pods/",
  "ios/App/DerivedData/",
  ".pnpm-store/",
];

const SKIP_FILES = new Set([
  "pnpm-lock.yaml",
  ".env.encrypted",
  ".ai/infra/scripts/security-audit.mjs",
  ".ai/infra/scripts/security-audit.test.mjs",
]);

const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|tgz|woff2?|ttf|otf|mp3|mp4|wav|mov|wasm|keystore|p12|cer|crt)$/i;

/** Guard skills that only read; they must not declare write/edit. */
const READ_ONLY_GUARDS = new Set([
  "dexie-schema-guardian",
  "i18n-checker",
  "visual-ui-reviewer",
  "smart-test-runner",
]);

function scannableFiles() {
  return gitFiles().filter((file) => {
    if (SKIP_FILES.has(file)) return false;
    if (SKIP_PREFIXES.some((prefix) => file.startsWith(prefix))) return false;
    if (BINARY.test(file)) return false;
    return true;
  });
}

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) if (source[i] === "\n") line += 1;
  return line;
}

function checkSecrets(files) {
  const findings = [];
  for (const file of files) {
    let source;
    try {
      source = readText(file);
    } catch {
      continue;
    }
    if (source.length > 2_000_000) continue;
    if (source.includes("audit:allow-secret-pattern")) continue;
    for (const { name, pattern } of SECRET_PATTERNS) {
      const match = pattern.exec(source);
      if (!match) continue;
      findings.push(
        finding({
          code: "secret-pattern",
          file,
          line: lineOf(source, match.index),
          message: `possible ${name} in a tracked file (value not printed)`,
          hint: "remove it, rotate the credential, and load it from .env.local instead",
        })
      );
    }
  }
  return findings;
}

function checkTrackedEnv() {
  const tracked = new Set(gitFiles());
  const findings = [];
  for (const file of [".env", ".env.local", ".env.production", ".env.development.local"]) {
    if (tracked.has(file)) {
      findings.push(
        finding({
          code: "tracked-env",
          file,
          message: "local environment file is tracked by git",
          hint: "remove it from the index and keep it gitignored",
        })
      );
    }
  }
  return findings;
}

function checkMcpPinning() {
  const findings = [];
  const manifests = ["mcp.json", ".cursor/mcp.json"];
  for (const file of manifests) {
    if (!exists(file)) continue;
    const manifest = readJson(file);
    if (!manifest?.mcpServers) {
      findings.push(finding({ code: "mcp-config", file, message: "manifest does not parse or has no mcpServers" }));
      continue;
    }
    for (const [name, server] of Object.entries(manifest.mcpServers)) {
      for (const arg of server.args ?? []) {
        if (!/^(@[\w.-]+\/)?[\w.-]+@/.test(arg)) continue;
        if (!/@\d+\.\d+\.\d+$/.test(arg)) {
          findings.push(
            finding({
              code: "mcp-unpinned",
              file,
              message: `server "${name}" uses an unpinned package spec: ${arg}`,
              hint: "pin name@x.y.z so a compromised release cannot be pulled in silently",
            })
          );
        }
      }
      if (server.env && Object.keys(server.env).length > 0) {
        findings.push(
          finding({
            code: "mcp-secret",
            file,
            message: `server "${name}" carries env values in a tracked manifest`,
          })
        );
      }
    }
  }
  return findings;
}

function checkSkillProvenance() {
  const findings = [];
  const lock = readJson("skills-lock.json");
  if (!lock?.skills) {
    return [finding({ code: "lock-shape", file: "skills-lock.json", message: "cannot read skills-lock.json" })];
  }
  for (const [name, entry] of Object.entries(lock.skills)) {
    if (!entry?.source || !entry?.skillPath) {
      findings.push(
        finding({
          code: "skill-provenance",
          file: "skills-lock.json",
          message: `skill "${name}" has no recorded source; an external instruction cannot be audited`,
        })
      );
    }
  }
  if (exists(".agents/skills/README.md")) {
    const readme = readText(".agents/skills/README.md").toLowerCase();
    const reviewsExternal = readme.includes("review");
    const namesExternal =
      readme.includes("third-party") || readme.includes("open registry") || readme.includes("external");
    if (!reviewsExternal || !namesExternal) {
      findings.push(
        finding({
          code: "external-instruction",
          file: ".agents/skills/README.md",
          severity: "warn",
          message: "skill index no longer documents that external skills run with agent permissions and need review",
        })
      );
    }
  }
  return findings;
}

function checkUnsafeShell(files) {
  const findings = [];
  const executable = files.filter(
    (file) =>
      (/\.(?:sh|mjs|cjs|js|ts)$/.test(file) && (file.startsWith(".agents/") || file.startsWith(".ai/infra/scripts/"))) ||
      file === ".husky/pre-commit"
  );
  for (const file of executable) {
    const source = readText(file);
    for (const { name, pattern } of UNSAFE_SHELL) {
      const match = pattern.exec(source);
      if (!match) continue;
      findings.push(
        finding({
          code: "unsafe-shell",
          file,
          line: lineOf(source, match.index),
          message: `unsafe shell pattern "${name}" in an executable agent asset`,
          hint: "replace it with a reviewed, pinned step; see .ai/infra/permission-model.md",
        })
      );
    }
  }
  return findings;
}

function checkToolPermissions() {
  const findings = [];
  const files = gitFiles().filter((file) => /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(file));
  for (const file of files) {
    const name = file.split("/")[2];
    const { data } = parseFrontmatter(readText(file));
    const tools = data?.["allowed-tools"];
    if (!Array.isArray(tools) || tools.length === 0) continue;
    if (READ_ONLY_GUARDS.has(name) && tools.some((tool) => tool === "write" || tool === "edit")) {
      findings.push(
        finding({
          code: "tool-permission",
          file,
          message: `read-only guard "${name}" declares a write tool`,
          hint: "guards must stay read-only; see .ai/infra/permission-model.md",
        })
      );
    }
  }
  return findings;
}

export function run() {
  const files = scannableFiles();
  return [
    ...checkSecrets(files),
    ...checkTrackedEnv(),
    ...checkMcpPinning(),
    ...checkSkillProvenance(),
    ...checkUnsafeShell(files),
    ...checkToolPermissions(),
  ];
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2), { booleans: ["json", "help"] });
  if (flags.help) {
    process.stdout.write("Usage: node .ai/infra/scripts/security-audit.mjs [--json]\n");
    return;
  }
  const findings = run();
  process.exitCode = report({
    title: "security + supply-chain audit",
    findings,
    success: "no secrets, unpinned MCP packages, unsafe shell snippets, or over-broad guards",
    json: flags.json === true,
  });
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`✖ security audit crashed: ${error?.stack ?? error}\n`);
    process.exit(2);
  }
}
