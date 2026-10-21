import type { MetadataRoute } from "next";
import { SITE_URL } from "@/app/(website)/_lib/seo";

/** The indexable pages of the website; the legal pages and the app are noindex and stay out. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/pricing`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
