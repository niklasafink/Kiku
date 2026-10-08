"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { createSegmenter, pcmToWav, rms } from "@/lib/audio";
import { formatDuration } from "@/lib/format";

// Safety net against a recording that was forgotten; length itself is not a technical limit.
const MAX_SECONDS = 30 * 60;

type Phase = "idle" | "starting" | "recording" | "transcribing";

async function transcribe(
  endpoint: string,
  chunks: Float32Array[],
  sampleRate: number,
  signal: AbortSignal,
): Promise<string> {
  const wav = await pcmToWav(chunks, sampleRate);
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: wav,
        signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      return data.text as string;
    } catch (e) {
      if (attempt >= 1 || signal.aborted) throw e;
    }
  }
}

/** Records from the microphone and hands back the AI transcript. */
export function Recorder({
  onTranscript,
  disabled,
  endpoint = "/api/transcribe",
  compact = false,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  endpoint?: string;
  /** Smaller button with a short status line, for sitting beside a text field. */
  compact?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const stopRef = useRef<() => void>(() => {});
  const cleanupRef = useRef<() => void>(() => {});
  const ringRef = useRef<HTMLSpanElement>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupRef.current();
    };
  }, []);

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
      setError("Das Mikrofon ist hier nicht verfügbar. Es funktioniert nur über HTTPS oder localhost.");
      return;
    }
    setPhase("starting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Kein Zugriff auf das Mikrofon. Bitte erlaube den Zugriff in den Browser-Einstellungen.");
      setPhase("idle");
      return;
    }

    const audioContext = new AudioContext();
    try {
      await audioContext.audioWorklet.addModule("/recorder-worklet.js");
      await audioContext.resume();
      if (!mountedRef.current) throw new Error("unmounted");
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      void audioContext.close();
      setError("Die Aufnahme konnte nicht gestartet werden.");
      setPhase("idle");
      return;
    }

    // Finished pieces are transcribed while the recording continues, so little is left to do at the end.
    const abort = new AbortController();
    const parts: string[] = [];
    const pending: Promise<void>[] = [];
    let failure: string | null = null;
    const segmenter = createSegmenter(audioContext.sampleRate, (chunks) => {
      const position = pending.length;
      pending.push(
        transcribe(endpoint, chunks, audioContext.sampleRate, abort.signal).then(
          (text) => {
            parts[position] = text;
          },
          (e) => {
            failure = e instanceof Error && e.message ? e.message : "Die Transkription ist fehlgeschlagen.";
          },
        ),
      );
    });

    const capture = new AudioWorkletNode(audioContext, "pcm-capture");
    capture.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const level = rms(event.data);
      segmenter.push(event.data, level);
      // Input level drives the pulsing ring; written straight to the DOM to avoid re-rendering per batch.
      if (ringRef.current) ringRef.current.style.transform = `scale(${1 + Math.min(1, level * 4) * 0.7})`;
    };
    audioContext.createMediaStreamSource(stream).connect(capture);
    // The node only runs while it leads to the output; it never writes to it, so nothing is played back.
    capture.connect(audioContext.destination);

    // Keeps the screen on, since a locked device stops the microphone.
    const wakeLock = navigator.wakeLock?.request("screen").catch(() => null);

    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += 1;
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) stopRef.current();
    }, 1000);

    const release = () => {
      clearInterval(timer);
      capture.port.onmessage = null;
      stream.getTracks().forEach((track) => track.stop());
      void audioContext.close();
      void wakeLock?.then((lock) => lock?.release());
      stopRef.current = () => {};
      cleanupRef.current = () => {};
    };
    cleanupRef.current = () => {
      abort.abort();
      release();
    };

    stopRef.current = async () => {
      release();
      // From here on, leaving the page only needs to cancel the uploads.
      cleanupRef.current = () => abort.abort();
      segmenter.flush();
      setPhase("transcribing");
      await Promise.all(pending);
      if (abort.signal.aborted) return;

      const text = parts.filter(Boolean).join(" ");
      if (text) onTranscript(text);
      if (failure) {
        setError(
          text
            ? "Ein Teil der Aufnahme konnte nicht transkribiert werden. Prüfe den Text und ergänze, was fehlt."
            : failure,
        );
      } else if (!text) {
        setError("Es wurde nichts Verständliches erkannt. Versuch es noch einmal.");
      }
      setPhase("idle");
    };

    setSeconds(0);
    setPhase("recording");
  }

  const busy = phase === "starting" || phase === "transcribing";
  const size = compact ? "size-12" : "size-16";

  return (
    <div className={`flex flex-col items-center ${compact ? "w-20 gap-1.5" : "gap-3"}`}>
      {phase === "recording" ? (
        <button
          type="button"
          onClick={() => stopRef.current()}
          className={`relative grid ${size} place-items-center rounded-full bg-error text-error-content`}
          aria-label="Aufnahme beenden"
        >
          <span ref={ringRef} className="absolute inset-0 rounded-full bg-error/30 transition-transform duration-100" aria-hidden />
          <Square className={compact ? "relative size-4" : "relative size-6"} fill="currentColor" />
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={disabled || busy}
          className={`btn btn-primary btn-circle btn-chunky ${size}`}
          aria-label="Antwort einsprechen"
        >
          {busy ? <span className={`loading loading-spinner ${compact ? "loading-md" : "loading-lg"}`} /> : <Mic className={compact ? "size-5" : "size-7"} />}
        </button>
      )}

      <p className={compact ? "text-center text-[11px] leading-tight font-bold" : "min-h-6 text-sm font-bold"} aria-live="polite">
        {(phase === "idle" || phase === "starting") && <span className="opacity-70">Antwort einsprechen</span>}
        {phase === "recording" && <span className="tabular-nums">{compact ? formatDuration(seconds) : `Aufnahme läuft · ${formatDuration(seconds)}`}</span>}
        {phase === "transcribing" && <span className="opacity-70">{compact ? "Transkribiert …" : "Wird transkribiert …"}</span>}
      </p>

      {error && (
        <p role="alert" className="alert alert-error alert-soft w-full text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
