// The study tandem: a spoken conversation about the cards of one folder. Shared by the browser,
// which holds the conversation, and the server, which writes and voices the next reply.
import { toPlainText } from "./richText";

/**
 * quiz: the partner asks the cards and both work out the answer.
 * teach: the user explains the topic of a card and the partner asks back.
 * free: no cards in turn, the user asks whatever they want about the folder.
 */
export type TandemMode = "quiz" | "teach" | "free";
export const TANDEM_MODES = ["quiz", "teach", "free"] as const satisfies readonly TandemMode[];

export interface TandemCard {
  question: string;
  solution: string;
}

export interface TandemMessage {
  role: "user" | "assistant";
  text: string;
}

/** Voices of the speech model the partner can talk with; the first one is the default. */
export const TANDEM_VOICES = [
  { id: "jessica", label: "Jessica" },
  { id: "sarah", label: "Sarah" },
  { id: "will", label: "Will" },
  { id: "george", label: "George" },
  { id: "brian", label: "Brian" },
] as const;
export type TandemVoice = (typeof TANDEM_VOICES)[number]["id"];
export const isTandemVoice = (value: unknown): value is TandemVoice => TANDEM_VOICES.some((voice) => voice.id === value);

/** All card texts sent as the partner's knowledge, in characters. Roughly 12,000 tokens per turn. */
export const MAX_KNOWLEDGE_CHARS = 48_000;
/** One card within the knowledge; a longer one is cut, the card under discussion is not. */
export const MAX_KNOWLEDGE_CARD_CHARS = 3_000;
/** Earlier turns sent along. Older ones drop out; the cards themselves are always there. */
export const MAX_HISTORY = 30;
export const MAX_MESSAGE_CHARS = 6_000;
/** Longest reply that is voiced: about a minute of speech. */
export const MAX_SPOKEN_CHARS = 1_200;

/** What the model appends when the conversation moves on to the next card. */
export const NEXT_MARK = "[[NEXT]]";

/** A card as the partner reads it: without markup and pictures. Null if nothing is left to talk about. */
export function tandemCard(card: { question: string; solution: string }): TandemCard | null {
  const question = toPlainText(card.question);
  const solution = toPlainText(card.solution);
  return question && solution ? { question, solution } : null;
}

/**
 * The cards that fit into the knowledge of the partner, in the order given. Once the budget
 * is used up the rest is left out, so a very large folder is known only in part.
 */
export function knowledgeOf(cards: TandemCard[], budget = MAX_KNOWLEDGE_CHARS): TandemCard[] {
  const result: TandemCard[] = [];
  let used = 0;
  for (const card of cards) {
    const cut = {
      question: card.question.slice(0, MAX_KNOWLEDGE_CARD_CHARS),
      solution: card.solution.slice(0, MAX_KNOWLEDGE_CARD_CHARS),
    };
    used += cut.question.length + cut.solution.length;
    if (used > budget) break;
    result.push(cut);
  }
  return result;
}

/**
 * Splits what the model wrote into what is shown, what is voiced and whether the next card is up.
 * Stage directions in square brackets such as [warmly] are performed by the voice, not shown.
 */
export function parseReply(raw: string): { text: string; spoken: string; advance: boolean } {
  const advance = raw.includes(NEXT_MARK);
  const spoken = clip(raw.replaceAll(NEXT_MARK, "").replace(/[*_#`]/g, "").trim());
  const text = spoken
    .replace(/\[[^\]\n]{1,40}\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([.,!?])/g, "$1")
    .trim();
  return { text, spoken, advance };
}

/** Cuts an overlong reply after the last full sentence that still fits. */
function clip(text: string): string {
  if (text.length <= MAX_SPOKEN_CHARS) return text;
  const head = text.slice(0, MAX_SPOKEN_CHARS);
  const end = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "));
  return end > MAX_SPOKEN_CHARS / 2 ? head.slice(0, end + 1) : head;
}
