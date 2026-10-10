import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Landing } from "../_components/Landing";
import { SERVER_MODE } from "@/server/auth";

// Same content as "/" for visitors, so keep it out of search results.
export const metadata: Metadata = { robots: { index: false } };

/** The homepage for people who are signed in: "/" shows them the library instead. */
export default function HomepagePreview() {
  if (!SERVER_MODE) notFound();
  return <Landing />;
}
