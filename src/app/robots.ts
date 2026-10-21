import type { MetadataRoute } from "next";
import { SITE_URL } from "@/app/(website)/_lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // The API has nothing to read; everything else is open, and pages that should stay out
    // of search results say so with noindex, which crawlers only see when they may fetch them.
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
