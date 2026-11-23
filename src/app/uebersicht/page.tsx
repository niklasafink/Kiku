"use client";

import { FileText } from "lucide-react";
import { useDocumentTitle } from "@/lib/hooks";

const PDFS = [
  { name: "Umsatzsteuer", file: "USt_Karten_Uebersicht.pdf" },
  { name: "Abgabenordnung", file: "AO_Karten_Uebersicht.pdf" },
  { name: "Erbschaftsteuer", file: "ErbSt_Karten_Uebersicht.pdf" },
];

export default function UebersichtPage() {
  useDocumentTitle("Karten-Übersicht");
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-black">Karten-Übersicht</h1>
      <ul className="flex flex-col gap-3">
        {PDFS.map((pdf) => (
          <li key={pdf.file}>
            <a className="tile flex items-center gap-3 p-4 font-bold" href={`/karten-uebersicht/${pdf.file}`}>
              <FileText className="size-5" aria-hidden /> {pdf.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
