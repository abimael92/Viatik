import { describe, expect, it } from "vitest";

import {
  buildPaletteGroups,
  flattenPaletteGroups,
  normalizeText,
  paletteSearchText,
  PALETTE_PER_GROUP_CAP,
  type PaletteItem,
} from "@/components/pro/command-search";

function item(id: string, group: PaletteItem["group"], searchText: string, label = id): PaletteItem {
  return { id, group, label, searchText: paletteSearchText(searchText) };
}

describe("normalizeText", () => {
  it("lowercases, strips accents, and trims", () => {
    expect(normalizeText("  LisBón ")).toBe("lisbon");
    expect(normalizeText("México City")).toBe("mexico city");
    expect(normalizeText("SÃO  Paulo")).toBe("sao  paulo");
  });
});

describe("buildPaletteGroups", () => {
  const navigation = [
    item("home", "navigation", "go to home", "Go to Home"),
    item("trips", "navigation", "go to trips", "Go to Trips"),
  ];
  const actions = [item("expense", "actions", "add expense", "Add expense")];

  it("shows only action and navigation groups on an empty query", () => {
    const groups = buildPaletteGroups("", {
      actions,
      navigation,
      trips: [item("t1", "trips", "lisbon")],
      contacts: [item("c1", "contacts", "ana")],
    });
    expect(groups.map((group) => group.id)).toEqual(["actions", "navigation"]);
  });

  it("matches trips and contacts case- and accent-insensitively", () => {
    const groups = buildPaletteGroups("  LÍS ", {
      actions,
      navigation,
      trips: [item("t1", "trips", "lisbon portugal"), item("t2", "trips", "tokyo")],
      contacts: [item("c1", "contacts", "análisis")],
    });
    const trips = groups.find((group) => group.id === "trips");
    expect(trips?.items.map((i) => i.id)).toEqual(["t1"]);
    const contacts = groups.find((group) => group.id === "contacts");
    expect(contacts?.items.map((i) => i.id)).toEqual(["c1"]);
  });

  it("requires two characters before searching activities", () => {
    const activities = [item("a1", "activities", "museum visit")];
    const oneChar = buildPaletteGroups("m", { navigation: [], activities });
    expect(oneChar.find((group) => group.id === "activities")).toBeUndefined();
    const twoChars = buildPaletteGroups("mu", { navigation: [], activities });
    expect(twoChars.find((group) => group.id === "activities")?.items).toHaveLength(1);
  });

  it("caps each group at five items and preserves input order", () => {
    const trips = Array.from({ length: 8 }, (_, i) => item(`t${i}`, "trips", "lisbon"));
    const groups = buildPaletteGroups("lisbon", { trips });
    const group = groups.find((g) => g.id === "trips");
    expect(group?.items.map((i) => i.id)).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    expect(group?.items.length).toBe(PALETTE_PER_GROUP_CAP);
  });

  it("never caps the actions and navigation command groups", () => {
    const navigation = Array.from({ length: 8 }, (_, i) => item(`n${i}`, "navigation", "command"));
    const groups = buildPaletteGroups("", { navigation });
    expect(groups.find((g) => g.id === "navigation")?.items).toHaveLength(8);
  });

  it("drops empty groups and keeps the declared group order", () => {
    const groups = buildPaletteGroups("xa", {
      actions: [item("a", "actions", "xaaction")],
      navigation: [item("n", "navigation", "xanav")],
      trips: [item("t", "trips", "xatrip")],
      activities: [item("ac", "activities", "xaactivity")],
      contacts: [item("c", "contacts", "xacontact")],
    });
    expect(groups.map((group) => group.id)).toEqual([
      "actions",
      "navigation",
      "trips",
      "activities",
      "contacts",
    ]);
  });
});

describe("flattenPaletteGroups", () => {
  it("returns the flat cross-group ordering used for arrow-key navigation", () => {
    const groups = buildPaletteGroups("", {
      actions: [item("a", "actions", "add expense")],
      navigation: [item("n1", "navigation", "trips"), item("n2", "navigation", "contacts")],
    });
    expect(flattenPaletteGroups(groups).map((i) => i.id)).toEqual(["a", "n1", "n2"]);
  });
});
