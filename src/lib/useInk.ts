"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { dropInk, hasMarkings, loadInk, storeInk, type PageInk, type PdfInk } from "./pdfInk";
import { joinPdfs, splitPdfs } from "./richText";

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

/**
 * The markings on the PDFs of a card side (`value` is its text), and a way to change them. A change
 * is kept in a new file a moment after the last stroke, and `onChange` gets the text naming it.
 * If the text comes to name another file (marked somewhere else), that one is shown.
 */
export function useMarkings(value: string, onChange: (value: string) => void) {
  const inkId = splitPdfs(value).ink;
  const stored = useInk(inkId);
  // What was marked here, on top of the file it was built on; shown until the text names another file.
  const [edited, setEdited] = useState<{ base: string | null; ink: PdfInk } | null>(null);
  const markings = edited && edited.base === inkId ? edited.ink : stored;
  const latest = useRef({ value, onChange });
  useLayoutEffect(() => {
    latest.current = { value, onChange };
  });
  const pending = useRef<PdfInk | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Files that were replaced; one is removed when the next one replaces it, by when the card text no longer names it.
  const replaced = useRef<string[]>([]);
  const flush = useRef(() => {});
  useEffect(() => {
    flush.current = () => {
      clearTimeout(timer.current);
      const next = pending.current;
      if (!next) return;
      pending.current = null;
      const { body, pdfs, ink: was } = splitPdfs(latest.current.value);
      const id = hasMarkings(next) ? storeInk(next) : null;
      if (was) replaced.current.push(was);
      while (replaced.current.length > 1) void dropInk(replaced.current.shift()!);
      const text = joinPdfs(body, pdfs, id);
      // The next change builds on this one, not on the text from before.
      latest.current = { ...latest.current, value: text };
      setEdited({ base: id, ink: next });
      latest.current.onChange(text);
    };
  });
  useEffect(() => {
    const leave = () => flush.current();
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, []);

  function mark(pdf: string, next: PageInk) {
    const all = { ...markings, [pdf]: next };
    setEdited({ base: inkId, ink: all });
    pending.current = all;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush.current(), 500);
  }

  return { markings, mark };
}
