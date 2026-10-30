import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IdeaMapCard,
  osmEmbedUrl,
  osmPlaceUrl,
} from "@/features/trip-planner/components/idea-map-card";

const coordinates = { latitude: 23.2494, longitude: -106.4111 };

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
});

describe("IdeaMapCard", () => {
  it("embeds the OpenStreetMap panel with a marker when coordinates are known", () => {
    render(
      <IdeaMapCard destination="Mazatlán, Mexico" latitude={coordinates.latitude} longitude={coordinates.longitude} />
    );

    const frame = screen.getByTitle("Map of Mazatlán, Mexico") as HTMLIFrameElement;
    expect(frame.getAttribute("src")).toContain("openstreetmap.org/export/embed.html");
    expect(frame.getAttribute("src")).toContain("marker=23.24940,-106.41110");
    expect(frame.getAttribute("loading")).toBe("lazy");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("shows a static location tile and an external link when coordinates are missing", () => {
    render(<IdeaMapCard destination="Mazatlán, Mexico" latitude={null} longitude={null} />);

    expect(screen.queryByTitle("Map of Mazatlán, Mexico")).toBeNull();
    expect(screen.getByText("Location")).toBeTruthy();
    expect(screen.getByText("Location not fixed yet")).toBeTruthy();

    const link = screen.getByRole("link", { name: /Open in maps/ });
    expect(link.getAttribute("href")).toBe(
      "https://www.openstreetmap.org/search?query=Mazatl%C3%A1n%2C%20Mexico"
    );
  });

  it("falls back to the static tile when the device is offline", () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });

    render(
      <IdeaMapCard destination="Mazatlán, Mexico" latitude={coordinates.latitude} longitude={coordinates.longitude} />
    );

    expect(screen.queryByTitle("Map of Mazatlán, Mexico")).toBeNull();
    expect(screen.getByText(/The map needs a connection/)).toBeTruthy();
  });

  it("resolves the location on demand and then renders the map", async () => {
    const onResolveLocation = vi.fn(async () => coordinates);

    render(
      <IdeaMapCard
        destination="Mazatlán, Mexico"
        latitude={null}
        longitude={null}
        onResolveLocation={onResolveLocation}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Locate/ }));

    await waitFor(() =>
      expect(screen.getByTitle("Map of Mazatlán, Mexico")).toBeTruthy()
    );
    expect(onResolveLocation).toHaveBeenCalledTimes(1);
  });

  it("reports a failed lookup without breaking the card", async () => {
    const onResolveLocation = vi.fn(async () => null);

    render(
      <IdeaMapCard
        destination="Nowhereville, Atlantis"
        latitude={null}
        longitude={null}
        onResolveLocation={onResolveLocation}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Locate/ }));

    expect(await screen.findByText("Could not find this place")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open in maps/ })).toBeTruthy();
  });

  it("auto-resolves once when asked to", async () => {
    const onResolveLocation = vi.fn(async () => coordinates);

    render(
      <IdeaMapCard
        destination="Mazatlán, Mexico"
        latitude={null}
        longitude={null}
        autoResolve
        onResolveLocation={onResolveLocation}
      />
    );

    await waitFor(() =>
      expect(screen.getByTitle("Map of Mazatlán, Mexico")).toBeTruthy()
    );
    expect(onResolveLocation).toHaveBeenCalledTimes(1);
  });
});

describe("OpenStreetMap URLs", () => {
  it("builds a keyless embed url around the marker", () => {
    const url = osmEmbedUrl(coordinates);
    expect(url.startsWith("https://www.openstreetmap.org/export/embed.html?bbox=")).toBe(true);
    expect(url).toContain("marker=23.24940,-106.41110");
  });

  it("links to the marker when coordinates exist and to a search otherwise", () => {
    expect(osmPlaceUrl("Mazatlán, Mexico", coordinates)).toContain("mlat=23.24940");
    expect(osmPlaceUrl("Mazatlán, Mexico")).toContain("search?query=");
  });
});
