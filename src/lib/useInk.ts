"use client";

import { useEffect, useState } from "react";
import { loadInk, type PdfInk } from "./pdfInk";

const NONE: PdfInk = {};

/** The markings kept in the file with this id, or none until they are loaded (or if there is no file). */
export function useInk(id: string | null): PdfInk {
  const [loaded, setLoaded] = useState<{ id: string; ink: PdfInk } | null>(null);
  useEffect(() => {
    if (!id) return;
    let active = true;
    void loadInk(id).then((ink) => active && setLoaded({ id, ink }));
    return () => {
      active = false;
    };
  }, [id]);
  return id && loaded?.id === id ? loaded.ink : NONE;
}
