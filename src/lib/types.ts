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
}

export interface Card {
  id: string;
  folderId: string;
  question: string;
  solution: string;
  createdAt: number;
  updatedAt: number;
}

export interface Attempt {
  id: string;
  cardId: string;
  createdAt: number;
  inputMode: "voice" | "text";
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
  /** Solution shown without answering; nothing is saved. */
  revealed: boolean;
  attempt: Attempt | null;
  previousScore: number | null;
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
