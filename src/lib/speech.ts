// Dictation with the browser's own speech recognition (Web Speech API). It costs nothing, but
// exists only in Chrome, Edge and Safari, and the browser decides where the audio is processed.

interface RecognitionResults {
  length: number;
  [index: number]: { 0: { transcript: string } };
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: RecognitionResults }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export const dictationAvailable = () => Boolean(recognitionClass());

export type DictationFailure = "denied" | "failed";

// How long to wait for the last words after stopping.
const FINAL_RESULT_MS = 2500;
// A run that ends this quickly did not really listen; several in a row mean recognition is not working.
const DEAD_RUN_MS = 500;
const MAX_DEAD_RUNS = 4;

/**
 * Listens until stopped. The browser ends a recognition by itself after a pause or about a
 * minute, so it is restarted until then and the pieces are joined.
 */
export function startDictation(onFailure: (reason: DictationFailure) => void): {
  /** Stops listening and returns everything that was understood. */
  stop: () => Promise<string>;
  cancel: () => void;
} {
  const Recognition = recognitionClass()!;
  const done: string[] = [];
  let current = "";
  let active: Recognition | null = null;
  let stopped = false;
  let finish: (() => void) | null = null;
  let deadRuns = 0;

  const close = () => {
    if (current.trim()) done.push(current.trim());
    current = "";
    active = null;
  };

  function listen() {
    const startedAt = Date.now();
    const recognition = new Recognition();
    recognition.lang = "de-DE";
    // Chrome on Android repeats earlier text in continuous mode; one utterance per run avoids that.
    recognition.continuous = !/Android/i.test(navigator.userAgent);
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      // Everything of this run so far, including words that are not final yet.
      current = Array.from({ length: event.results.length }, (_, i) => event.results[i][0].transcript.trim()).join(" ");
    };
    recognition.onerror = (event) => {
      // Silence and our own stop are normal; the run ends and the next one starts.
      if (event.error === "no-speech" || event.error === "aborted" || stopped) return;
      stopped = true;
      onFailure(event.error === "not-allowed" || event.error === "service-not-allowed" ? "denied" : "failed");
    };
    recognition.onend = () => {
      close();
      if (stopped) return finish?.();
      deadRuns = Date.now() - startedAt < DEAD_RUN_MS ? deadRuns + 1 : 0;
      if (deadRuns < MAX_DEAD_RUNS) return listen();
      stopped = true;
      onFailure("failed");
    };
    active = recognition;
    try {
      recognition.start();
    } catch {
      active = null;
      stopped = true;
      onFailure("failed");
    }
  }
  listen();

  return {
    stop: () =>
      new Promise((resolve) => {
        const deliver = () => {
          close();
          resolve(done.join(" "));
        };
        stopped = true;
        if (!active) return deliver();
        finish = deliver;
        setTimeout(deliver, FINAL_RESULT_MS);
        active.stop();
      }),
    cancel: () => {
      stopped = true;
      active?.abort();
    },
  };
}
