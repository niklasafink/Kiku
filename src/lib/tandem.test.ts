import { describe, expect, it } from "vitest";
import { knowledgeOf, MAX_KNOWLEDGE_CARD_CHARS, MAX_SPOKEN_CHARS, parseReply, partialText, speakableEnd, tandemCard } from "./tandem";

describe("tandemCard", () => {
  it("strips markup and pictures", () => {
    expect(tandemCard({ question: "Was ist **Mitose**?", solution: "Zellteilung ![](kiku-img:abc)" })).toEqual({
      question: "Was ist Mitose?",
      solution: "Zellteilung",
    });
  });

  it("drops cards that are only a picture", () => {
    expect(tandemCard({ question: "![](kiku-img:abc)", solution: "Herz" })).toBeNull();
  });
});

describe("knowledgeOf", () => {
  it("keeps cards in order until the budget is used up", () => {
    const cards = ["a", "b", "c"].map((name) => ({ question: name, solution: "x".repeat(9) }));
    expect(knowledgeOf(cards, 20).map((card) => card.question)).toEqual(["a", "b"]);
  });

  it("cuts a very long card", () => {
    const [card] = knowledgeOf([{ question: "q", solution: "x".repeat(MAX_KNOWLEDGE_CARD_CHARS + 50) }]);
    expect(card.solution).toHaveLength(MAX_KNOWLEDGE_CARD_CHARS);
  });
});

describe("parseReply", () => {
  it("separates the mark for the next card and the stage direction from the text", () => {
    expect(parseReply("[warmly] Genau, das passt. Weiter: Was ist die Meiose? [[NEXT]]")).toEqual({
      text: "Genau, das passt. Weiter: Was ist die Meiose?",
      spoken: "[warmly] Genau, das passt. Weiter: Was ist die Meiose?",
      advance: true,
    });
  });

  it("stays on the card without the mark and removes markdown", () => {
    const reply = parseReply("Fast. Was fehlt noch bei der **Prophase**?");
    expect(reply.advance).toBe(false);
    expect(reply.text).toBe("Fast. Was fehlt noch bei der Prophase?");
  });

  it("removes a stage direction in the middle without leaving a gap", () => {
    expect(parseReply("Stimmt [laughs] , fast.").text).toBe("Stimmt, fast.");
  });

  it("cuts an overlong reply at the end of a sentence", () => {
    const reply = parseReply("Ein Satz. ".repeat(300));
    expect(reply.spoken.length).toBeLessThanOrEqual(MAX_SPOKEN_CHARS);
    expect(reply.spoken.endsWith(".")).toBe(true);
  });
});

describe("partialText", () => {
  it("hides a stage direction or mark that is only half written", () => {
    expect(partialText("[warm")).toBe("");
    expect(partialText("[warmly] Okay, fast. [[NE")).toBe("Okay, fast.");
  });
});

describe("speakableEnd", () => {
  it("voices the first sentence on its own", () => {
    const raw = "[warmly] Im Kern ja, aber das ist zu eng. Eine vGA";
    expect(raw.slice(0, speakableEnd(raw, 0, true))).toBe("[warmly] Im Kern ja, aber das ist zu eng.");
  });

  it("waits while the first sentence is not finished", () => {
    expect(speakableEnd("[warmly] Im Kern ja, aber", 0, true)).toBe(-1);
  });

  it("does not end a sentence after an abbreviation or a norm", () => {
    const raw = "Nach § 8 Abs. 3 S. 2 KStG gilt z. B. Folgendes für die Gesellschaft. Weiter";
    expect(raw.slice(0, speakableEnd(raw, 0, true))).toBe("Nach § 8 Abs. 3 S. 2 KStG gilt z. B. Folgendes für die Gesellschaft.");
  });

  it("gathers later sentences into longer pieces", () => {
    const raw = "Erster Satz ist hier. Zweiter Satz kommt jetzt. Dritter";
    expect(speakableEnd(raw, 21, false)).toBe(-1);
  });
});
