import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { errorCopy } from "@/lib/i18n/error-copy";
import { frontendCopy } from "@/lib/i18n/frontend-copy";
import { translations } from "@/lib/i18n/translations";

const ROOT = path.resolve(__dirname, "../..");
const UI_ROOTS = ["app", "components", "features"];
const USER_FACING_ATTRIBUTES = new Set([
  "placeholder",
  "title",
  "alt",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "label",
]);
const ALLOWED_LITERALS = new Set([
  "Viatik",
  "Viatik.",
  "ESC",
  "US",
  "https://",
  "MB)",
  "km/h",
  "shares",
  "Day",
  "From",
  "To",
  "s",
]);

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, acc);
    } else if (/\.tsx$/.test(entry.name) && !isTestFile(full) && !isDevHarness(full)) {
      acc.push(full);
    }
  }
  return acc;
}

function isTestFile(file: string): boolean {
  return file.includes("__tests__") || /\.(test|spec)\.tsx?$/.test(file);
}

/** The E2E harness is developer tooling, not traveler-facing UI. */
function isDevHarness(file: string): boolean {
  return file.includes(`${path.sep}e2e${path.sep}`);
}

function hasUserText(value: string): boolean {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || ALLOWED_LITERALS.has(trimmed)) return false;
  return /[A-Za-zÀ-ÿ]{2,}\s+[A-Za-zÀ-ÿ]{2,}/.test(trimmed);
}

function hardcodedUiCopy(): string[] {
  const findings: string[] = [];
  for (const dir of UI_ROOTS) {
    for (const file of collectFiles(path.join(ROOT, dir))) {
      const source = fs.readFileSync(file, "utf8");
      const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const report = (node: ts.Node, text: string) => {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        findings.push(`${path.relative(ROOT, file)}:${line + 1} ${text.trim()}`);
      };
      const visit = (node: ts.Node) => {
        if (ts.isJsxText(node) && hasUserText(node.getText(sf))) {
          report(node, node.getText(sf));
        }
        if (ts.isJsxAttribute(node)) {
          const name = node.name.getText(sf);
          if (USER_FACING_ATTRIBUTES.has(name) && node.initializer && ts.isStringLiteral(node.initializer)) {
            if (hasUserText(node.initializer.text)) report(node, node.initializer.text);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }
  return findings;
}

function flatten(tree: object, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === "string") out[`${prefix}${key}`] = value;
    else if (value && typeof value === "object") Object.assign(out, flatten(value, `${prefix}${key}.`));
  }
  return out;
}

describe("i18n dictionary parity", () => {
  it("keeps every frontend copy key in both locales", () => {
    expect(Object.keys(frontendCopy.es).sort()).toEqual(Object.keys(frontendCopy.en).sort());
  });

  it("keeps every error key in both locales", () => {
    expect(Object.keys(errorCopy.es).sort()).toEqual(Object.keys(errorCopy.en).sort());
  });

  it("keeps every nested translation key in both locales", () => {
    expect(Object.keys(flatten(translations.es)).sort()).toEqual(Object.keys(flatten(translations.en)).sort());
  });

  it("translates Spanish copy instead of reusing English", () => {
    const english = flatten(frontendCopy.en);
    const spanish = flatten(frontendCopy.es);
    const allowedShared = new Set([
      "editor",
      "eur",
      "placeholderJordan",
      "subtotal",
      "total",
      "ferry",
      "tripIdeaFlexible",
      "tripPlannerCategoryPersonal",
      "scoutIdeaStayHotel",
      "scoutIdeaDialogHotel",
      "scoutWizardStayHotel",
    ]);
    const untranslated = Object.keys(english)
      .filter((key) => english[key] === spanish[key] && !allowedShared.has(key))
      .filter((key) => /[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(english[key]));
    expect(untranslated).toEqual([]);
  });
});

describe("user-facing components", () => {
  it("renders no hardcoded UI copy outside the translation dictionaries", () => {
    expect(hardcodedUiCopy()).toEqual([]);
  });
});
