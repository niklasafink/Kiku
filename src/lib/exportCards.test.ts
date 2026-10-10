import { describe, expect, it } from "vitest";
import { exportCards } from "./exportCards";
import { parseImport } from "./importCards";
import type { Card, Folder } from "./types";

const folders: Folder[] = [
  { id: "bio", parentId: null, name: "Biologie", emoji: "🧬", createdAt: 0 },
  { id: "cell", parentId: "bio", name: "Zelle", emoji: "📁", createdAt: 0 },
];
const card = (id: string, folderId: string, question: string, solution: string, createdAt: number): Card => ({
  id,
  folderId,
  question,
  solution,
  createdAt,
  updatedAt: createdAt,
});

const tricky = 'Zeile 1\nZeile 2; mit "Anführung"\tund Tab';

describe("exportCards", () => {
  it("writes a CSV the import reads back unchanged", () => {
    const cards = [card("2", "bio", "Zweite?", "b", 2), card("1", "bio", "Erste?", tricky, 1)];
    const csv = exportCards(cards, folders, "csv");
    expect(csv.startsWith("﻿Frage;Lösung\r\n")).toBe(true);
    expect(parseImport(csv.slice(1)).rows).toEqual([
      { question: "Erste?", solution: tricky },
      { question: "Zweite?", solution: "b" },
    ]);
  });

  it("adds the folder path when cards come from several folders", () => {
    const cards = [card("1", "cell", "Mitose?", "Kernteilung", 1), card("2", "bio", "DNA?", "Erbgut", 2)];
    const lines = exportCards(cards, folders, "csv").slice(1).split("\r\n");
    expect(lines).toEqual(["Frage;Lösung;Ordner", "DNA?;Erbgut;Biologie", "Mitose?;Kernteilung;Biologie / Zelle"]);
  });

  it("writes two tab-separated columns without pictures for other apps", () => {
    const cards = [card("1", "bio", "Aufbau?\n![](kiku-img:abc-1)", tricky, 1)];
    const text = exportCards(cards, folders, "tab");
    expect(text).not.toContain("kiku-img");
    expect(parseImport(text, "tab").rows).toEqual([{ question: "Aufbau?", solution: tricky }]);
  });

  it("writes a file for Anki that keeps the formatting and reads back here", () => {
    const cards = [card("1", "bio", "Was ist **Mitose**?", "Kernteilung\nin *vier* Phasen\n\n- Pro\n- Meta\n\n![](kiku-img:abc-1)", 1)];
    const text = exportCards(cards, folders, "anki");
    expect(text).toBe("#separator:tab\n#html:true\nWas ist <b>Mitose</b>?\tKernteilung<br>in <i>vier</i> Phasen<br><ul><li>Pro</li><li>Meta</li></ul>");
    expect(parseImport(text).rows).toEqual([{ question: "Was ist **Mitose**?", solution: "Kernteilung\nin *vier* Phasen\n- Pro\n- Meta" }]);
  });
});
