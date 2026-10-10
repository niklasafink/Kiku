export type SegmentStatus = "correct" | "missing" | "unsure";

export interface Segment {
  text: string;
  status: SegmentStatus;
  note?: string;
}

export interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  emoji: string;
  createdAt: number;
  /** Day of the exam (local midnight, ms). Applies to all cards below this folder. */
  examDate?: number | null;
}

export interface Card {
  id: string;
  folderId: string;
  question: string;
  solution: string;
  /** Free labels across folders, e.g. "klausurrelevant". The star is the tag STAR_TAG. */
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

/** Tag behind the star on a card. */
export const STAR_TAG = "★";

/** A picture used in a card. Cards refer to it as ![](kiku-img:<id>). */
export interface StoredImage {
  id: string;
  type: string;
  data: ArrayBuffer;
  createdAt: number;
  /** 0 = the account does not have it yet. */
  uploaded: 0 | 1;
}

/** How an answer was given: spoken, typed or written by hand. */
export type InputMode = "voice" | "text" | "pen";

export interface Attempt {
  id: string;
  cardId: string;
  createdAt: number;
  inputMode: InputMode;
  answerText: string;
  /** Solution text at the time of the attempt, so old attempts stay readable after edits. */
  solutionSnapshot: string;
  segments: Segment[];
  /** 0–100, share of the solution that was recognised as correct. */
  score: number;
}

/** What the study session remembers about one card. */
export interface StudyCardState {
  answer: string;
  usedVoice: boolean;
  /** The answer (or part of it) was written by hand and read by the AI. */
  usedPen?: boolean;
  /** Solution shown without answering; nothing is saved. */
  revealed: boolean;
  attempt: Attempt | null;
  previousScore: number | null;
  /** When the card is due again after this attempt. */
  nextDue?: number;
  /** What the AI said about the gaps of this attempt, once it was asked. */
  explanation?: string;
}

/** An unfinished study session, stored so it can be picked up again later. */
export interface SavedSession {
  /** See sessionKey() in repo.ts. */
  key: string;
  /** Card order of the session, including a shuffle. */
  cardIds: string[];
  index: number;
  states: Record<string, StudyCardState>;
  updatedAt: number;
}
