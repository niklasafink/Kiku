import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dictationAvailable, startDictation } from "./speech";

// A stand-in for the browser's recognition: tests say what it "hears" and when a run ends.
class FakeRecognition {
  static runs: FakeRecognition[] = [];
  continuous = false;
  onresult: ((event: { results: unknown }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start() {
    FakeRecognition.runs.push(this);
  }
  stop() {
    this.onend?.();
  }
  abort() {}
  hear(...transcripts: string[]) {
    this.onresult?.({ results: Object.assign(transcripts.map((transcript) => [{ transcript }]), {}) });
  }
}

const latest = () => FakeRecognition.runs[FakeRecognition.runs.length - 1];

beforeEach(() => {
  FakeRecognition.runs = [];
  vi.useFakeTimers();
  vi.stubGlobal("window", { webkitSpeechRecognition: FakeRecognition });
  vi.stubGlobal("navigator", { userAgent: "Chrome" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("startDictation", () => {
  it("is available when the browser has speech recognition", () => {
    expect(dictationAvailable()).toBe(true);
    vi.stubGlobal("window", {});
    expect(dictationAvailable()).toBe(false);
  });

  it("joins the runs the browser ends by itself", async () => {
    const dictation = startDictation(() => {});
    latest().hear("Ein Rechtsgut", "wurde");
    latest().hear("Ein Rechtsgut", "wurde verletzt");
    vi.advanceTimersByTime(8000);
    latest().onend?.();
    expect(FakeRecognition.runs).toHaveLength(2);
    latest().hear(" und ein Schaden ");
    expect(await dictation.stop()).toBe("Ein Rechtsgut wurde verletzt und ein Schaden");
  });

  it("keeps listening through silence", async () => {
    const dictation = startDictation(() => {});
    vi.advanceTimersByTime(8000);
    latest().onerror?.({ error: "no-speech" });
    latest().onend?.();
    latest().hear("doch noch");
    expect(await dictation.stop()).toBe("doch noch");
  });

  it("reports a refused microphone and stops restarting", () => {
    const onFailure = vi.fn();
    startDictation(onFailure);
    latest().onerror?.({ error: "not-allowed" });
    latest().onend?.();
    expect(onFailure).toHaveBeenCalledWith("denied");
    expect(FakeRecognition.runs).toHaveLength(1);
  });

  it("gives up when runs keep ending at once", () => {
    const onFailure = vi.fn();
    startDictation(onFailure);
    for (let i = 0; i < 10 && !onFailure.mock.calls.length; i++) latest().onend?.();
    expect(onFailure).toHaveBeenCalledWith("failed");
    expect(FakeRecognition.runs).toHaveLength(4);
  });
});
