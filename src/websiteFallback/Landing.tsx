"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Stands in for the homepage when the marketing website is not part of the checkout. */
export function Landing() {
  const router = useRouter();
  useEffect(() => router.replace("/auth/sign-in"), [router]);
  return (
    <div className="grid min-h-dvh place-items-center bg-base-200">
      <span className="loading loading-spinner loading-lg" aria-label="Lädt" />
    </div>
  );
}
