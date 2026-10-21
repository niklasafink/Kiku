import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WRAP } from "../_components/shared";
import { WebsiteFrame } from "../_components/WebsiteFrame";
import { NOINDEX } from "../_lib/seo";
import { SERVER_MODE } from "@/server/auth";

export const metadata: Metadata = {
  title: "Impressum | Kiku",
  description: "Anbieterkennzeichnung der Dealzforest UG (haftungsbeschränkt).",
  robots: NOINDEX,
};

const SECTION_HEADING = "text-xs font-extrabold tracking-wide uppercase opacity-60";

export default function ImprintPage() {
  // The imprint names the operator of the hosted app, not of a local-only install.
  if (!SERVER_MODE) notFound();

  return (
    <WebsiteFrame>
      <div className="flex-1 bg-base-200">
      <div className={`${WRAP} flex-1 py-12 lg:py-16`}>
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-black">Impressum</h1>
          <div className="tile mt-8 flex flex-col gap-6 p-6">
            <section>
              <h2 className={SECTION_HEADING}>Angaben gemäß § 5 DDG</h2>
              <address className="mt-1.5 not-italic">
                Dealzforest UG (haftungsbeschränkt)
                <br />
                Europa-Allee 49
                <br />
                60327 Frankfurt am Main
                <br />
                Deutschland
              </address>
            </section>
            <section>
              <h2 className={SECTION_HEADING}>Vertreten durch</h2>
              <p className="mt-1.5">Geschäftsführer: Jörn Ulrich Fink</p>
            </section>
            <section>
              <h2 className={SECTION_HEADING}>Kontakt</h2>
              <p className="mt-1.5">
                E-Mail:{" "}
                <a href="mailto:info@dealzforest.com" className="link">
                  info@dealzforest.com
                </a>
              </p>
            </section>
            <section>
              <h2 className={SECTION_HEADING}>Registereintrag</h2>
              <p className="mt-1.5">
                Registergericht: Amtsgericht Frankfurt am Main
                <br />
                Registernummer: HRB 135880
              </p>
            </section>
            <section>
              <h2 className={SECTION_HEADING}>Umsatzsteuer-ID</h2>
              <p className="mt-1.5">
                Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: DE370289510
              </p>
            </section>
            <section>
              <h2 className={SECTION_HEADING}>Verbraucherstreitbeilegung</h2>
              <p className="mt-1.5">
                Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
                Verbraucherschlichtungsstelle teilzunehmen.
              </p>
            </section>
          </div>
        </div>
      </div>
      </div>
    </WebsiteFrame>
  );
}
