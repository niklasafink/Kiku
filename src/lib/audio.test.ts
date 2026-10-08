import { describe, expect, it } from "vitest";
import { createSegmenter } from "./audio";

const RATE = 1000;
const second = (level: number) => new Float32Array(RATE).fill(level);

describe("createSegmenter", () => {
  it("cuts at the quietest batch between the minimum and maximum length", () => {
    const segments: number[] = [];
    const segmenter = createSegmenter(RATE, (chunks) => segments.push(chunks.length));

    // 130 s of speech with a pause in second 50 and second 105 (counted from 1).
    for (let i = 1; i <= 130; i++) segmenter.push(second(i === 50 || i === 105 ? 0.001 : 0.5));
    expect(segments).toEqual([50, 55]);

    segmenter.flush();
    expect(segments).toEqual([50, 55, 25]);
  });

  it("emits a short recording as one segment and nothing when empty", () => {
    const segments: number[] = [];
    const segmenter = createSegmenter(RATE, (chunks) => segments.push(chunks.length));
    segmenter.flush();
    segmenter.push(second(0.5));
    segmenter.flush();
    segmenter.flush();
    expect(segments).toEqual([1]);
  });
});
