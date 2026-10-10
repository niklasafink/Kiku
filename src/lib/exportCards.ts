// Cards as a table for spreadsheets and other flashcard apps. What is written here can be
// read back by the import.
import { markdownToHtml } from "./html";
import { IMAGE_SCHEME } from "./richText";
import { pathTo } from "./tree";
import type { Card, Folder } from "./types";

export type ExportFormat = "csv" | "tab" | "anki";

function field(value: string, delimiter: string): string {
  return /["\n\r]/.test(value) || value.includes(delimiter) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toDelimited(rows: string[][], delimiter: string): string {
  return rows.map((row) => row.map((cell) => field(cell, delimiter)).join(delimiter)).join("\r\n");
}

const IMAGES = new RegExp(`!\\[[^\\]\\n]*\\]\\(${IMAGE_SCHEME}[A-Za-z0-9-]+\\)\\n?`, "g");

/**
 * - "csv": semicolons and a byte order mark, which is what Excel and Numbers open correctly
 *   in German; with a third column for the folder when cards come from several folders.
 * - "tab": two tab-separated columns of plain card text, which Quizlet and most other apps
 *   read. Pictures only exist inside Kiku and are left out.
 * - "anki": the same two columns as HTML with the header lines Anki's import understands, so
 *   bold text, lists and tables arrive as such.
 */
export function exportCards(cards: Card[], folders: Folder[], format: ExportFormat): string {
  const sorted = [...cards].sort((a, b) => a.createdAt - b.createdAt);
  if (format === "anki") {
    const rows = sorted.map((card) => [markdownToHtml(card.question), markdownToHtml(card.solution)]);
    return `#separator:tab\n#html:true\n${toDelimited(rows, "\t")}`;
  }
  if (format === "tab") {
    return toDelimited(
      sorted.map((card) => [card.question.replace(IMAGES, "").trim(), card.solution.replace(IMAGES, "").trim()]),
      "\t",
    );
  }

  const paths = new Map<string, string>();
  const pathOf = (folderId: string) => {
    let path = paths.get(folderId);
    if (path === undefined) {
      path = pathTo(folders, folderId)
        .map((f) => f.name)
        .join(" / ");
      paths.set(folderId, path);
    }
    return path;
  };
  const withFolder = new Set(sorted.map((card) => card.folderId)).size > 1;
  const rows = sorted
    .sort((a, b) => (withFolder ? pathOf(a.folderId).localeCompare(pathOf(b.folderId), "de") : 0))
    .map((card) => [card.question, card.solution, ...(withFolder ? [pathOf(card.folderId)] : [])]);
  return `﻿${toDelimited([["Frage", "Lösung", ...(withFolder ? ["Ordner"] : [])], ...rows], ";")}`;
}

export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function fileName(base: string, extension: string): string {
  const safe = base.replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-") || "kiku";
  return `${safe}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}
