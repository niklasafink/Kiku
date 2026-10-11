"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { HeroGlow } from "./HeroGlow";
import { CARD, LEAD, SCREEN } from "./shared";
import { OFFERS, type Offer } from "@/lib/offers";

type Status = "sending" | "sent" | "failed";

/** Sends the purchase request of the signed-in account and says what happens next. */
export function PurchaseRequest({ offer, email }: { offer: Offer; email: string }) {
  const [status, setStatus] = useState<Status>("sending");

  const send = useCallback(
    () =>
      fetch("/api/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer }),
      })
        .then((response) => response.ok)
        .catch(() => false),
    [offer],
  );

  useEffect(() => {
    let active = true;
    void send().then((ok) => {
      if (active) setStatus(ok ? "sent" : "failed");
    });
    return () => {
      active = false;
    };
  }, [send]);

  return (
    <section className={`${SCREEN} relative isolate flex-1`}>
      <HeroGlow />
      <div className="mx-auto w-full max-w-2xl text-center">
        <h1 className="text-4xl leading-[1.15] font-bold tracking-tight text-balance lg:text-5xl">
          {status === "failed" ? "Das hat nicht geklappt" : "Ich melde mich bei dir"}
        </h1>
        {status === "failed" ? (
          <p className={LEAD} role="alert">
            Deine Anfrage ist nicht angekommen. Versuch es noch einmal oder schreib an info@dealzforest.com.
          </p>
        ) : (
          <p className={LEAD}>
            Danke für deine Anfrage. Ich schreibe dir an <strong>{email}</strong> und wir klären alles Weitere.
          </p>
        )}

        <div className={`${CARD} mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 text-left`}>
          <div>
            <p className="text-sm opacity-70">Dein Tarif</p>
            <p className="text-lg font-semibold">{OFFERS[offer]}</p>
          </div>
          <p className="text-sm font-semibold" role="status">
            {status === "sending" && "Anfrage wird gesendet …"}
            {status === "sent" && <span className="text-success">Anfrage ist angekommen</span>}
            {status === "failed" && (
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setStatus("sending");
                  void send().then((ok) => setStatus(ok ? "sent" : "failed"));
                }}
              >
                Noch einmal senden
              </button>
            )}
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-semibold text-accent-content hover:brightness-105"
          >
            Zur App
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link href="/pricing" className="text-sm font-semibold hover:underline">
            Anderen Tarif wählen
          </Link>
        </div>
      </div>
    </section>
  );
}
