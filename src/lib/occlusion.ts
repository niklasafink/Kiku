// Image occlusion: parts of a picture are covered and one of them is asked for. The boxes travel
// in the alternative text of the picture, so such a card is still ordinary card text:
//   ![occ:120,340,200,80;500,100,150,60#1](kiku-img:<id>)
// Numbers are thousandths of the picture's width and height; "#1" is the box that is asked for
// and "#1r" shows that box uncovered (the solution side).
import { IMAGE_SCHEME } from "./richText";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Occlusion {
  boxes: Box[];
  /** Index of the box this card asks for. */
  asked: number;
  /** The asked box is shown uncovered. */
  revealed: boolean;
}

const PREFIX = "occ:";

export function parseOcclusion(alt: string): Occlusion | null {
  const match = /^occ:([\d,;]+)#(\d+)(r?)$/.exec(alt);
  if (!match) return null;
  const boxes: Box[] = [];
  for (const part of match[1].split(";")) {
    const [x, y, w, h] = part.split(",").map(Number);
    if (![x, y, w, h].every((n) => Number.isFinite(n) && n >= 0 && n <= 1000)) return null;
    boxes.push({ x, y, w, h });
  }
  const asked = Number(match[2]);
  return asked < boxes.length ? { boxes, asked, revealed: match[3] === "r" } : null;
}

export function occlusionMarkup(imageId: string, boxes: Box[], asked: number, revealed: boolean): string {
  const list = boxes.map((box) => [box.x, box.y, box.w, box.h].map(Math.round).join(",")).join(";");
  return `![${PREFIX}${list}#${asked}${revealed ? "r" : ""}](${IMAGE_SCHEME}${imageId})`;
}

/** One card per labelled box: the picture with that box marked as the question, its label as the solution. */
export function occlusionCards(
  imageId: string,
  boxes: (Box & { label: string })[],
  prompt: string,
): { question: string; solution: string }[] {
  return boxes.map((box, i) => ({
    question: `${prompt.trim() || "Was ist hier verdeckt?"}\n\n${occlusionMarkup(imageId, boxes, i, false)}`,
    solution: `${box.label.trim()}\n\n${occlusionMarkup(imageId, boxes, i, true)}`,
  }));
}
