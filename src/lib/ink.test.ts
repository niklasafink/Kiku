import { describe, expect, it } from "vitest";
import { boxOf, eraserHits, hasInk, movedStroke, strokesInLoop, type Stroke } from "./ink";

const line = (x1: number, y1: number, x2: number, y2: number, extra: Partial<Stroke> = {}): Stroke => ({
  points: [
    { x: x1, y: y1, pressure: 0.5 },
    { x: (x1 + x2) / 2, y: (y1 + y2) / 2, pressure: 0.5 },
    { x: x2, y: y2, pressure: 0.5 },
  ],
  ...extra,
});

describe("eraserHits", () => {
  const stroke = line(0, 0, 100, 0);
  it("hits a stroke the eraser crosses, however fast it moved", () => {
    expect(eraserHits(stroke, { x: 50, y: -80 }, { x: 50, y: 80 })).toBe(true);
  });
  it("hits a stroke the eraser comes close to", () => {
    expect(eraserHits(stroke, { x: 50, y: 8 }, { x: 60, y: 8 })).toBe(true);
  });
  it("misses a stroke that is further away", () => {
    expect(eraserHits(stroke, { x: 50, y: 30 }, { x: 60, y: 30 })).toBe(false);
    expect(eraserHits(stroke, { x: 130, y: -80 }, { x: 130, y: 80 })).toBe(false);
  });
  it("reaches further for the wide marker", () => {
    expect(eraserHits(line(0, 0, 100, 0, { highlight: true }), { x: 50, y: 16 }, { x: 60, y: 16 })).toBe(true);
    expect(eraserHits(stroke, { x: 50, y: 16 }, { x: 60, y: 16 })).toBe(false);
  });
});

describe("strokesInLoop", () => {
  const loop = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  it("takes strokes that lie mostly inside the loop", () => {
    const inside = line(10, 10, 90, 90);
    const outside = line(200, 10, 300, 90);
    const mostlyOut = line(90, 50, 400, 50);
    expect(strokesInLoop([inside, outside, mostlyOut], loop)).toEqual([inside]);
  });
  it("needs a loop", () => {
    expect(strokesInLoop([line(10, 10, 90, 90)], loop.slice(0, 2))).toEqual([]);
  });
});

describe("movedStroke", () => {
  it("moves every point and keeps what kind of stroke it is", () => {
    const moved = movedStroke(line(0, 0, 10, 10, { highlight: true }), 5, -3);
    expect(moved.highlight).toBe(true);
    expect(boxOf([moved])).toEqual({ left: 5, top: -3, right: 15, bottom: 7 });
  });
});

describe("hasInk", () => {
  it("does not take marking alone for an answer", () => {
    expect(hasInk([line(0, 0, 10, 10, { highlight: true })])).toBe(false);
    expect(hasInk([line(0, 0, 10, 10, { highlight: true }), line(0, 0, 10, 10)])).toBe(true);
  });
});
