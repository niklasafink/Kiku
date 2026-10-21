// Norms (§ 15 Abs. 1 Nr. 2 EStG, Art. 3 GG, R 8.5 KStR) in a text, and the check which of the norms
// of a model solution an answer names. Pure and deterministic: what the AI marks as missing is
// complemented by this, because for exams in law and tax a missing norm is a missing point.
import { scoreSegments } from "./grading";
import type { Segment } from "./types";

export interface Norm {
  /** Upper case abbreviation of the law, if the text names one. */
  law: string | null;
  /** "§ 15", "Art. 3", "R 8.5". */
  para: string;
  abs: string | null;
  nr: string | null;
  satz: string | null;
  lit: string | null;
}

/** One place in a text that cites norms, possibly several at once ("§ 15 Abs. 1 Nr. 1 und 2 EStG"). */
export interface Citation {
  start: number;
  end: number;
  text: string;
  norms: Norm[];
}

type Level = "abs" | "nr" | "satz" | "lit";

const NUMBER_WORDS: Record<string, number> = {
  eins: 1, ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19,
  zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
};
const UNITS: Record<string, number> = { ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };

function wordToNumber(word: string): number | null {
  const w = word.toLowerCase();
  if (w in NUMBER_WORDS) return NUMBER_WORDS[w];
  const [, unit, tens] = /^([a-zäöüß]+?)und([a-zäöüß]+)$/.exec(w) ?? [];
  if (unit in UNITS && tens in NUMBER_WORDS && NUMBER_WORDS[tens] >= 20) return NUMBER_WORDS[tens] + UNITS[unit];
  return null;
}

/** Spoken numbers behind a keyword become digits: "Paragraf fünfzehn Absatz eins" → "Paragraf 15 Absatz 1". */
export function normalizeSpoken(text: string): string {
  return text.replace(/\b(Paragra(?:ph|f)|Absatz|Satz|Nummer|Artikel)\s+([A-Za-zÄÖÜäöüß]+)/gi, (whole, key: string, word: string) => {
    const n = wordToNumber(word);
    return n === null ? whole : `${key} ${n}`;
  });
}

const HEAD = /(§§?|\bArt(?:ikel|\.)?|\bParagra(?:ph|f)(?:en)?)\s*(\d{1,4}[a-z]?)(?![\p{L}\d])/giu;
// Handbook references as the exam solutions cite them: "R 8.5 KStR", "H 4.2 EStH".
const HANDBOOK = /\b([RH])\s?(\d{1,3}(?:\.\d{1,3})*[a-z]?)\s+(?:Abs\.\s*\d+\s+)?([A-ZÄÖÜ][A-Za-zÄÖÜ]{1,6}[RH])\b/gu;

const KEYWORDS: { level: Level; pattern: RegExp }[] = [
  { level: "abs", pattern: /^(?:Abs(?:ätze|atz|\.)?)\s*(?=\d|[IVX]\b)/iu },
  { level: "satz", pattern: /^(?:Sätze|Satz|S\.)\s*(?=\d)/u },
  { level: "nr", pattern: /^(?:Nrn?\.|Nummern|Nummer|Ziff(?:er|\.)?)\s*(?=\d)/iu },
  { level: "lit", pattern: /^(?:Buchst(?:abe|\.)?|Bst\.|lit\.?)\s*(?=[a-z](?![\p{L}]))/iu },
];
const VALUE: Record<Level, RegExp> = {
  abs: /^(\d{1,3}[a-z]?)(?![\p{L}\d])/u,
  satz: /^(\d{1,2})(?![\p{L}\d])/u,
  nr: /^(\d{1,3}[a-z]?)(?![\p{L}\d])/u,
  lit: /^([a-z]{1,2})(?![\p{L}\d])/iu,
};
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 } as Record<string, number>;
const SEPARATOR = /^\s*(?:,|;|und|sowie|bis|oder|[-–/])\s*/iu;
const LAW = /^(?:(?:des|der|im|dem)\s+)?([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{1,11})(?![\p{L}\d])/u;
// Abbreviations that follow a norm without being its law.
const NOT_A_LAW = new Set(["BFH", "BMF", "BGH", "BVERFG", "EUGH", "FG", "OFD", "RFH", "OLG", "LG", "BAG", "BSG"]);
const MAX_COMBINATIONS = 24;

const upperCount = (word: string) => (word.match(/[A-ZÄÖÜ]/g) ?? []).length;

function expandRange(from: string, to: string): string[] {
  const a = parseInt(from, 10);
  const b = parseInt(to, 10);
  if (!/^\d+$/.test(from) || !/^\d+$/.test(to) || b <= a || b - a > 10) return [from, to];
  return Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
}

/** Reads the values behind a keyword ("1 und 2", "1 bis 3", "1, 2"); returns them and where they end. */
function readValues(text: string, from: number, level: Level): { values: string[]; end: number } {
  const values: string[] = [];
  let i = from;
  let afterBis = false;
  for (;;) {
    const rest = text.slice(i);
    const value = VALUE[level].exec(rest);
    if (!value) break;
    const v = value[1].toLowerCase();
    if (afterBis && values.length > 0) {
      const first = values.pop()!;
      values.push(...expandRange(first, v));
    } else values.push(v);
    afterBis = false;
    i += value[0].length;
    // "f." and "ff." (and following) add nothing we could compare.
    const follow = /^\s*ff?\.(?!\p{L})/u.exec(text.slice(i));
    if (follow) i += follow[0].length;
    const separator = SEPARATOR.exec(text.slice(i));
    if (!separator) break;
    // A separator only continues the list when a value of the same kind follows.
    if (!VALUE[level].test(text.slice(i + separator[0].length))) break;
    afterBis = /^\s*bis\b/i.test(separator[0]);
    i += separator[0].length;
  }
  return { values, end: i };
}

function combine(para: string[], levels: Record<Level, string[]>, law: string | null): Norm[] {
  const pick = (values: string[]) => (values.length ? values : [null]);
  const result: Norm[] = [];
  for (const p of para)
    for (const abs of pick(levels.abs))
      for (const nr of pick(levels.nr))
        for (const satz of pick(levels.satz))
          for (const lit of pick(levels.lit)) {
            if (result.length < MAX_COMBINATIONS) result.push({ law, para: p, abs, nr, satz, lit });
          }
  return result;
}

/** Every place in the text that cites norms, in reading order. */
export function extractCitations(text: string): Citation[] {
  const found: Citation[] = [];

  HEAD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HEAD.exec(text))) {
    const art = !match[1].startsWith("§") && !/^Paragra/i.test(match[1]);
    const prefix = art ? "Art." : "§";
    const paras = [`${prefix} ${match[2].toLowerCase()}`];
    let i = match.index + match[0].length;

    // More paragraphs of the same law: "§§ 15, 16 und 17".
    const multiple = match[1] === "§§" || /en$/i.test(match[1]);
    if (multiple) {
      for (;;) {
        const separator = SEPARATOR.exec(text.slice(i));
        const next = separator && /^(\d{1,4}[a-z]?)(?![\p{L}\d])/u.exec(text.slice(i + separator[0].length));
        if (!separator || !next) break;
        paras.push(`${prefix} ${next[1].toLowerCase()}`);
        i += separator[0].length + next[0].length;
      }
    }

    const levels: Record<Level, string[]> = { abs: [], nr: [], satz: [], lit: [] };
    // "§ 15 I Nr. 1": a roman numeral right behind the number is the paragraph's Absatz.
    const roman = /^\s+(I{1,3}|IV|VI{0,3}|IX|X)(?=[\s,.]|$)/.exec(text.slice(i));
    if (roman) {
      levels.abs.push(String(ROMAN[roman[1]]));
      i += roman[0].length;
    }

    for (let guard = 0; guard < 12; guard++) {
      const rest = text.slice(i);
      const lead = /^[\s,]*/.exec(rest)![0];
      const keyword = KEYWORDS.find((k) => k.pattern.test(rest.slice(lead.length)));
      if (!keyword) break;
      const after = keyword.pattern.exec(rest.slice(lead.length))![0];
      let valueStart = i + lead.length + after.length;
      let values: string[];
      if (keyword.level === "abs" && /^[IVX]+\b/.test(text.slice(valueStart))) {
        const numeral = /^[IVX]+/.exec(text.slice(valueStart))![0];
        values = ROMAN[numeral] ? [String(ROMAN[numeral])] : [];
        valueStart += numeral.length;
        i = valueStart;
      } else {
        const read = readValues(text, valueStart, keyword.level);
        values = read.values;
        i = read.end;
      }
      if (values.length === 0) break;
      levels[keyword.level].push(...values.filter((v) => !levels[keyword.level].includes(v)));
    }

    let law: string | null = null;
    const gap = /^\s*/.exec(text.slice(i))![0].length;
    const behind = LAW.exec(text.slice(i + gap));
    if (behind && upperCount(behind[1]) >= 2 && !NOT_A_LAW.has(behind[1].toUpperCase())) {
      law = behind[1];
      i += gap + behind[0].length;
    }

    const end = i;
    found.push({ start: match.index, end, text: text.slice(match.index, end).trim(), norms: combine(paras, levels, law) });
    HEAD.lastIndex = end;
  }

  HANDBOOK.lastIndex = 0;
  while ((match = HANDBOOK.exec(text))) {
    found.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      norms: [{ law: match[3], para: `${match[1]} ${match[2].toLowerCase()}`, abs: null, nr: null, satz: null, lit: null }],
    });
  }
  found.sort((a, b) => a.start - b.start);

  // "§ 15 Abs. 1 und § 16 EStG": a citation without a law takes the one of the next, if only a connective lies between.
  for (let k = found.length - 2; k >= 0; k--) {
    const here = found[k];
    const next = found[k + 1];
    const law = next.norms[0]?.law;
    if (!law || here.norms.some((n) => n.law)) continue;
    if (/^\s*(?:,|und|sowie|i\.?\s?V\.?\s?m\.?|bzw\.?|oder|\/)?\s*$/i.test(text.slice(here.end, next.start))) {
      here.norms = here.norms.map((n) => ({ ...n, law }));
    }
  }
  return found;
}

export function normLabel(norm: Norm): string {
  return [
    norm.para,
    norm.abs && `Abs. ${norm.abs}`,
    norm.satz && `S. ${norm.satz}`,
    norm.nr && `Nr. ${norm.nr}`,
    norm.lit && `Buchst. ${norm.lit}`,
    norm.law,
  ]
    .filter(Boolean)
    .join(" ");
}

export type NormStatus = "named" | "partial" | "missing";

const LEVELS: Level[] = ["abs", "nr", "satz", "lit"];
const LEVEL_NAME: Record<Level, string> = { abs: "Abs.", nr: "Nr.", satz: "S.", lit: "Buchst." };

/** Whether `given` (from the answer) names `wanted` (from the solution): fully, only less specific, or not. */
function compare(wanted: Norm, given: Norm): "named" | "partial" | "other" | null {
  if (wanted.para !== given.para) return null;
  if (wanted.law && given.law && wanted.law.toUpperCase() !== given.law.toUpperCase()) return null;
  let partial = false;
  for (const level of LEVELS) {
    const w = wanted[level];
    const g = given[level];
    if (w === null) continue;
    if (g === null) partial = true;
    else if (g !== w) return "other";
  }
  return partial ? "partial" : "named";
}

export interface NormCheck {
  norm: Norm;
  label: string;
  status: NormStatus;
  /** What is missing or different, in words. */
  note?: string;
  /** The task heading of the solution the norm stands under, if there is one. */
  task: string | null;
  /** Where the norm is cited in the solution. */
  citation: Citation;
}

function judge(wanted: Norm, answer: Norm[]): { status: NormStatus; note?: string } {
  let partial: Norm | null = null;
  let other: Norm | null = null;
  for (const given of answer) {
    const result = compare(wanted, given);
    if (result === "named") return { status: "named" };
    if (result === "partial") partial ??= given;
    if (result === "other") other ??= given;
  }
  if (partial) {
    const lacking = LEVELS.filter((level) => wanted[level] !== null && partial![level] === null).map(
      (level) => `${LEVEL_NAME[level]} ${wanted[level]}`,
    );
    return { status: "partial", note: `Nur ${normLabel({ ...partial, law: null })} genannt, es fehlt ${lacking.join(", ")}.` };
  }
  if (other) return { status: "missing", note: `Du hast ${normLabel(other)} genannt.` };
  return { status: "missing" };
}

export interface Task {
  label: string;
  start: number;
  end: number;
}

const TASK_HEADING = /^[ \t]*(?:#{1,3}[ \t]*)?(?:\*\*)?((?:Aufgabe|Aufgabenteil|Teilaufgabe|Teil|Frage|Fall|Abschnitt)[ \t]*(?:\d+[a-z]?|[IVX]{1,4}))\b/gimu;

/** The tasks of a solution ("Aufgabe 1", "Teil II" …) with the stretch of text each one covers. */
export function tasksOf(text: string): Task[] {
  const starts: { label: string; start: number }[] = [];
  TASK_HEADING.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TASK_HEADING.exec(text))) {
    starts.push({ label: match[1].replace(/\s+/g, " ").trim(), start: match.index });
  }
  return starts.map((entry, i) => ({ ...entry, end: starts[i + 1]?.start ?? text.length }));
}

/** Which norms of the solution the answer names, in the order the solution cites them. */
export function checkNorms(solution: string, answer: string): NormCheck[] {
  const wanted = extractCitations(solution);
  const given = extractCitations(normalizeSpoken(answer)).flatMap((citation) => citation.norms);
  const tasks = tasksOf(solution);
  const seen = new Set<string>();
  const checks: NormCheck[] = [];
  for (const citation of wanted) {
    const task = tasks.findLast((t) => t.start <= citation.start)?.label ?? null;
    for (const norm of citation.norms) {
      const label = normLabel(norm);
      const id = `${task}|${label}`;
      if (seen.has(id)) continue;
      seen.add(id);
      checks.push({ norm, label, task, citation, ...judge(norm, given) });
    }
  }
  return checks;
}

/**
 * Lays the norm check over the graded segments: a norm of the solution that the answer does not
 * name becomes a segment of its own, marked as missing (partly named: not clear), even where the
 * AI let it pass. Returns the new segments and their score. Text stays untouched; segments are cut.
 */
export function markNorms(segments: Segment[], answer: string): { segments: Segment[]; score: number; checks: NormCheck[] } {
  const plain = segments.map((s) => s.text).join("");
  const checks = checkNorms(plain, answer);

  // One verdict per citation: the worst of its norms. Only the first place a norm is cited is marked.
  const marks = new Map<number, { citation: Citation; status: "missing" | "unsure"; note: string }>();
  const marked = new Set<string>();
  for (const check of checks) {
    if (check.status === "named") continue;
    const status = check.status === "missing" ? "missing" : "unsure";
    const note = check.status === "missing" ? check.note ?? `Norm nicht genannt: ${check.label}` : check.note!;
    const have = marks.get(check.citation.start);
    if (have && (have.status === "missing" || status === "unsure")) continue;
    if (marked.has(check.label) && !have) continue;
    marked.add(check.label);
    marks.set(check.citation.start, { citation: check.citation, status, note });
  }
  if (marks.size === 0) return { segments, score: scoreSegments(segments), checks };

  const result: Segment[] = [];
  let offset = 0;
  for (const segment of segments) {
    const from = offset;
    const to = offset + segment.text.length;
    offset = to;
    const inside = [...marks.values()]
      .filter(({ citation }) => citation.start >= from && citation.end <= to)
      .filter(({ status }) => segment.status === "correct" || (segment.status === "unsure" && status === "missing"))
      .sort((a, b) => a.citation.start - b.citation.start);
    if (inside.length === 0) {
      result.push(segment);
      continue;
    }
    let cursor = from;
    for (const { citation, status, note } of inside) {
      if (citation.start > cursor) result.push({ ...segment, text: plain.slice(cursor, citation.start), note: undefined });
      result.push({ text: plain.slice(citation.start, citation.end), status, note });
      cursor = citation.end;
    }
    if (cursor < to) result.push({ ...segment, text: plain.slice(cursor, to), note: undefined });
  }
  const clean = result.map((s) => (s.note === undefined ? { text: s.text, status: s.status } : s));
  return { segments: clean, score: scoreSegments(clean), checks };
}

export interface TaskReport {
  label: string;
  /** Share of the task's text the answer got right, 0–1. */
  covered: number;
  /** Nothing of the task was answered. */
  untouched: boolean;
  checks: NormCheck[];
}

/** The check by task, so tasks that were not worked on at all stand out. */
export function reportByTask(segments: Segment[], checks: NormCheck[]): TaskReport[] {
  const plain = segments.map((s) => s.text).join("");
  const tasks = tasksOf(plain);
  if (tasks.length === 0) return [];
  return tasks.map((task) => {
    let total = 0;
    let correct = 0;
    let offset = 0;
    for (const segment of segments) {
      const from = Math.max(offset, task.start);
      const to = Math.min(offset + segment.text.length, task.end);
      offset += segment.text.length;
      if (to <= from) continue;
      const length = plain.slice(from, to).replace(/\s/g, "").length;
      total += length;
      if (segment.status === "correct") correct += length;
    }
    const covered = total === 0 ? 0 : correct / total;
    return { label: task.label, covered, untouched: covered < 0.03, checks: checks.filter((c) => c.task === task.label) };
  });
}
