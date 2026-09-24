import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LanguageSwitcher } from "@/components/app-shell/language-switcher";
import { I18nProvider, STORAGE_KEY, useI18n } from "@/lib/i18n/i18n-provider";
import { translate } from "@/lib/i18n/translations";

function Probe() {
  const { t } = useI18n();
  return <p>{t("navigation.home")}</p>;
}

describe("I18nProvider", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        clear: () => storage.clear(),
      },
    });
  });

  afterEach(() => {
    storage.clear();
    document.documentElement.lang = "en";
  });

  it("changes translated content immediately and persists the locale", () => {
    render(
      <I18nProvider>
        <LanguageSwitcher />
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText("Home")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "es" } });

    expect(screen.getByText("Inicio")).toBeTruthy();
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe("es");
    expect(document.documentElement.lang).toBe("es");
  });

  it("restores a persisted locale before rendering translated content", () => {
    globalThis.localStorage.setItem(STORAGE_KEY, "es");
    document.documentElement.lang = "es";

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText("Inicio")).toBeTruthy();
  });

  it("localizes activity Must-do terminology without changing readiness checklist copy", () => {
    expect(translate("en", "common.activityMustDo")).toBe("Must-do");
    expect(translate("en", "common.activityMustDos")).toBe("Must-dos");
    expect(translate("es", "common.activityMustDo")).toBe("Imprescindible");
    expect(translate("es", "common.activityMustDos")).toBe("Imprescindibles");
    expect(translate("es", "common.activityMustDosProgress", { completed: 1, total: 2 }))
      .toBe("1/2 Imprescindibles completados");
    expect(translate("en", "common.viewChecklist")).toBe("View checklist");
  });
});
