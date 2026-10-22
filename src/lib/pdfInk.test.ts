import { describe, expect, it } from "vitest";
import { decodeInk, encodeInk, hasMarkings, type PdfInk } from "./pdfInk";

const ink: PdfInk = {
  "pdf-1": {
    1: [
      { points: [{ x: 10.04, y: 20.5, pressure: 0.5 }, { x: 11, y: 22, pressure: 0.72 }] },
      { points: [{ x: 5, y: 5, pressure: 0.5 }, { x: 80, y: 5, pressure: 0.5 }], highlight: true },
    ],
    3: [{ points: [{ x: 1, y: 2, pressure: 0.3 }] }],
  },
};

describe("encodeInk / decodeInk", () => {
  it("gives back the strokes, rounded to a tenth of a unit", () => {
    const back = decodeInk(encodeInk(ink));
    expect(back["pdf-1"][1][0].points).toEqual([{ x: 10, y: 20.5, pressure: 0.5 }, { x: 11, y: 22, pressure: 0.72 }]);
    expect(back["pdf-1"][1][1].highlight).toBe(true);
    expect(back["pdf-1"][1][0].highlight).toBeUndefined();
    expect(back["pdf-1"][3]).toHaveLength(1);
  });

  it("leaves out pages and PDFs without strokes", () => {
    const text = encodeInk({ "pdf-1": { 1: [], 2: [{ points: [] }] }, "pdf-2": {} });
    expect(decodeInk(text)).toEqual({});
  });

  it("reads anything else as no markings", () => {
    expect(decodeInk("kein JSON")).toEqual({});
    expect(decodeInk('{"v":1}')).toEqual({});
  });
});

describe("hasMarkings", () => {
  it("is true only if a stroke exists", () => {
    expect(hasMarkings(ink)).toBe(true);
    expect(hasMarkings({})).toBe(false);
    expect(hasMarkings({ "pdf-1": { 1: [] } })).toBe(false);
  });
});
