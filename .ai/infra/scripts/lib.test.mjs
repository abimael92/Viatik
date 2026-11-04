import { describe, expect, it } from "vitest";
import {
  globsOverlap,
  globToRegExp,
  markdownLinks,
  parseArgs,
  parseFrontmatter,
  resolveLink,
} from "./lib.mjs";

describe("parseArgs", () => {
  it("parses booleans, values and equals form", () => {
    const { flags, positional } = parseArgs(["record", "--json", "--task", "x", "--files=a,b"], {
      booleans: ["json"],
    });
    expect(positional).toEqual(["record"]);
    expect(flags).toEqual({ json: true, task: "x", files: "a,b" });
  });

  it("keeps a following flag from being consumed as a value", () => {
    const { flags } = parseArgs(["--coverage", "--full"], { booleans: ["coverage", "full"] });
    expect(flags).toEqual({ coverage: true, full: true });
  });

  it("passes everything after -- through positionally", () => {
    const { positional } = parseArgs(["run", "--", "--reporter=json"]);
    expect(positional).toEqual(["run", "--reporter=json"]);
  });
});

describe("parseFrontmatter", () => {
  it("reads scalar fields and list fields", () => {
    const { data, body } = parseFrontmatter(
      ['---', 'name: "demo"', "description: A demo skill", "allowed-tools:", "  - read", "  - grep", "---", "", "Body"].join("\n")
    );
    expect(data).toEqual({ name: "demo", description: "A demo skill", "allowed-tools": ["read", "grep"] });
    expect(body.trim()).toBe("Body");
  });

  it("reports missing frontmatter instead of throwing", () => {
    const result = parseFrontmatter("# no frontmatter");
    expect(result.error).toBe("missing frontmatter");
    expect(result.data).toBeNull();
  });
});

describe("markdownLinks", () => {
  it("ignores fenced code blocks and keeps relative links", () => {
    const source = [
      "[a](./a.md)",
      "```",
      "[ignored](./ignored.md)",
      "```",
      "[b](../b.md#section)",
    ].join("\n");
    const links = markdownLinks(source);
    expect(links.map((link) => link.target)).toEqual(["./a.md", "../b.md#section"]);
    expect(links[0].line).toBe(1);
  });

  it("resolves relative links and skips external ones", () => {
    expect(resolveLink("docs/a.md", "./b.md")).toBe("docs/b.md");
    expect(resolveLink("docs/a.md", "../c.md")).toBe("c.md");
    expect(resolveLink("docs/a.md", "https://example.com")).toBeNull();
    expect(resolveLink("docs/a.md", "#anchor")).toBeNull();
  });
});

describe("glob ownership", () => {
  it("matches a file under a directory glob", () => {
    expect(globToRegExp("features/x/**").test("features/x/components/a.tsx")).toBe(true);
    expect(globToRegExp("features/x/**").test("features/y/a.tsx")).toBe(false);
  });

  it("treats a directory prefix as overlapping", () => {
    expect(globsOverlap("features/x/**", "features/x/components/a.tsx")).toBe(true);
    expect(globsOverlap("features/x/**", "features/y/**")).toBe(false);
    expect(globsOverlap("lib/db/dexie.ts", "lib/db/dexie.ts")).toBe(true);
    expect(globsOverlap("lib/db/**", "lib/sync/outbox.ts")).toBe(false);
  });
});
