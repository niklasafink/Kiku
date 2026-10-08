import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Karteikarten",
    short_name: "Karteikarten",
    description: "Karteikarten lernen mit KI-Abgleich deiner Antwort.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f6f2",
    theme_color: "#5b4ff0",
    lang: "de",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
