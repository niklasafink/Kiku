import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "kiku",
    short_name: "kiku",
    description: "Karteikarten lernen mit KI-Abgleich deiner Antwort.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f6f2",
    theme_color: "#5b4ff0",
    lang: "de",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon0.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
