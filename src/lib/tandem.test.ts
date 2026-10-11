import { describe, expect, it } from "vitest";
import { knowledgeOf, MAX_KNOWLEDGE_CARD_CHARS, MAX_SPOKEN_CHARS, parseReply, tandemCard } from "./tandem";

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
