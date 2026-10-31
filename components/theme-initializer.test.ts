import { beforeEach, afterEach, describe, expect, it } from "vitest";

import { themeInitScript } from "@/components/theme-initializer";

// jsdom in this environment exposes no usable `localStorage`; shim an
// in-memory one so the evaluated init script sees browser-like storage.
const store = new Map<string, string>();
const storage = {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
};

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
});

function runScript() {
  // Evaluates the exact blocking script the server emits, in this jsdom.
  new Function(themeInitScript)();
}

afterEach(() => {
  storage.clear();
  document.documentElement.removeAttribute("data-sidebar");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.lang = "en";
});

describe("themeInitScript", () => {
  it("sets data-sidebar when the stored preference is collapsed", () => {
    storage.setItem("viatik-sidebar", "collapsed");
    runScript();
    expect(document.documentElement.dataset.sidebar).toBe("collapsed");
  });

  it("clears data-sidebar for expanded, missing, or invalid values", () => {
    document.documentElement.setAttribute("data-sidebar", "collapsed");
    storage.setItem("viatik-sidebar", "expanded");
    runScript();
    expect(document.documentElement.dataset.sidebar).toBeUndefined();

    document.documentElement.setAttribute("data-sidebar", "collapsed");
    storage.removeItem("viatik-sidebar");
    runScript();
    expect(document.documentElement.dataset.sidebar).toBeUndefined();

    document.documentElement.setAttribute("data-sidebar", "collapsed");
    storage.setItem("viatik-sidebar", "bogus");
    runScript();
    expect(document.documentElement.dataset.sidebar).toBeUndefined();
  });

  it("still applies theme and language", () => {
    storage.setItem("viatik-theme", "dark");
    storage.setItem("viatik-language", "es");
    runScript();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.lang).toBe("es");
  });
});
