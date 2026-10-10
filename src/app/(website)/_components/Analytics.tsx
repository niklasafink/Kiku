"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState, useSyncExternalStore } from "react";

const WEBSITE_ID = "dfid_4WIbuj1fFLvA2VQtkGVzo";
const DOMAIN = "kikucards.de";

const CONSENT_KEY = "kiku_consent";
const CONSENT_EVENT = "kiku:consent";
const OPEN_EVENT = "kiku:consent-open";
// What the default DataFast script sets; removed again when consent is withdrawn.
const DATAFAST_COOKIES = [
  "datafast_visitor_id",
  "datafast_visitor_first_seen_at",
  "datafast_visitor_session_count",
  "datafast_session_id",
];

/** "off" is the objection from the privacy page: no measurement at all in this browser. */
type Consent = "granted" | "denied" | "off";
type Mode = "cookies" | "cookieless" | "off";

function readConsent(): Consent | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" || value === "off" ? value : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The visitor's choice; "unknown" while rendering on the server, null when nothing was chosen yet. */
function useConsent() {
  return useSyncExternalStore<Consent | null | "unknown">(subscribe, readConsent, () => "unknown");
}

function clearDatafastCookies() {
  for (const name of DATAFAST_COOKIES) {
    for (const domain of ["", `; domain=.${DOMAIN}`, `; domain=.${window.location.hostname}`]) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
    }
  }
}

/**
 * The cookieless script sets no cookies but still keeps its ids in sessionStorage, which needs
 * consent just like a cookie does (§ 25 TDDDG). Without consent they stay in memory instead, so
 * nothing is written to or read from the device.
 */
function keepDatafastOffDevice() {
  try {
    const memory = new Map<string, string>();
    const session = window.sessionStorage;
    const { getItem, setItem, removeItem } = Storage.prototype;
    const ours = (storage: Storage, key: string) => storage === session && String(key).startsWith("datafast_");
    Storage.prototype.getItem = function (key) {
      return ours(this, key) ? (memory.get(key) ?? null) : getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (ours(this, key)) memory.set(key, String(value));
      else setItem.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      if (ours(this, key)) memory.delete(key);
      else removeItem.call(this, key);
    };
  } catch {
    // Storage is blocked altogether; the script then falls back to memory by itself.
  }
}

// A loaded script cannot be unloaded, so the mode is fixed for the lifetime of the page.
let mode: Mode | undefined;

function getMode(): Mode {
  if (!mode) {
    const consent = readConsent();
    mode = consent === "off" ? "off" : consent === "granted" ? "cookies" : "cookieless";
    if (mode === "cookieless") keepDatafastOffDevice();
  }
  return mode;
}

function choose(consent: Consent) {
  try {
    localStorage.setItem(CONSENT_KEY, consent);
  } catch {
    // Without storage the choice only holds for this page; no cookies are set either way.
  }
  if (consent !== "granted") clearDatafastCookies();
  window.dispatchEvent(new Event(CONSENT_EVENT));
  // Consent takes effect with the next page load. Less tracking than what is running must apply
  // at once, and the running script can only be stopped by loading the page again.
  const running = getMode();
  if ((running === "cookies" && consent !== "granted") || (running !== "off" && consent === "off")) {
    window.location.reload();
  }
}

const noSubscription = () => () => {};

/**
 * DataFast analytics with the consent banner. With consent the default script runs and sets
 * cookies; without it the cookieless script runs and nothing is stored on the device.
 */
export function Analytics() {
  const consent = useConsent();
  const scriptMode = useSyncExternalStore<Mode | null>(noSubscription, getMode, () => null);
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  const decide = (value: Consent) => {
    setReopened(false);
    choose(value);
  };

  return (
    <>
      {scriptMode && scriptMode !== "off" && (
        <Script
          src={`https://datafa.st/js/${scriptMode === "cookies" ? "script.js" : "script.cookieless.js"}`}
          data-website-id={WEBSITE_ID}
          data-domain={DOMAIN}
          data-disable-console="true"
        />
      )}
      {(consent === null || (reopened && consent !== "unknown")) && (
        <div
          role="dialog"
          aria-label="Cookie-Einstellungen"
          className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 rounded-2xl border border-base-300 bg-base-100 p-4 text-sm shadow-lg sm:right-auto sm:left-4 sm:max-w-sm"
        >
          <p className="font-semibold">Cookies für die Statistik?</p>
          <p className="mt-1 opacity-80">
            Mit deiner Einwilligung setzt unser Statistik-Dienst DataFast Cookies, um wiederkehrende Besuche zu
            erkennen. Ohne Einwilligung zählen wir Besuche nur ohne Cookies und ohne Speicherung auf deinem Gerät.{" "}
            <Link href="/datenschutz#statistik" className="underline">
              Mehr erfahren
            </Link>
          </p>
          {reopened && consent && (
            <p className="mt-2 opacity-60">
              Aktuell:{" "}
              {consent === "granted" ? "Cookies akzeptiert" : consent === "denied" ? "Cookies abgelehnt" : "Statistik abgeschaltet"}
            </p>
          )}
          {/* Both choices carry the same weight on purpose. */}
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn flex-1 btn-sm" onClick={() => decide("denied")}>
              Ablehnen
            </button>
            <button type="button" className="btn flex-1 btn-sm" onClick={() => decide("granted")}>
              Akzeptieren
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Brings the banner back, so a choice can be changed as easily as it was made. */
export function ConsentSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      Cookie-Einstellungen
    </button>
  );
}

/** Objection to the cookieless measurement (Art. 21 DSGVO): turns DataFast off in this browser. */
export function AnalyticsOptOut() {
  const consent = useConsent();
  if (consent === "off") {
    return <span className="font-semibold">Die Statistik ist in diesem Browser abgeschaltet.</span>;
  }
  return (
    <button type="button" className="btn btn-sm" onClick={() => choose("off")}>
      Statistik in diesem Browser abschalten
    </button>
  );
}
