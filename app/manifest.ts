import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Viatik — Offline-First Travel Itineraries",
    short_name: "Viatik",
    description: "Plan trips with friends, even offline. Viatik syncs your itinerary, expenses, and gallery whenever you are back online.",
    start_url: "/trips",
    display: "standalone",
    background_color: "#101a3a",
    theme_color: "#101a3a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
