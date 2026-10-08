// Browser-only helpers. The microphone is captured as raw samples and sent as 16 kHz mono
// WAV, which gives the server one small, predictable format on every device.

const TARGET_RATE = 16000;

// A recording is cut into pieces while it is still running, so each upload stays far below
// the request size limit of the host (16 kHz WAV is ~32 KB/s) and length is not restricted.
const SEGMENT_MIN_SECONDS = 45;
const SEGMENT_MAX_SECONDS = 60;

export function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

/**
 * Collects sample batches and emits a segment once enough audio has come in. Each cut is
 * placed at the quietest batch between the minimum and maximum length, which is normally a
 * pause between words rather than the middle of one.
 */
export function createSegmenter(sampleRate: number, onSegment: (chunks: Float32Array[]) => void) {
  let chunks: Float32Array[] = [];
  let frames = 0;
  let quietest: { index: number; level: number } | null = null;

  return {
    push(chunk: Float32Array, level = rms(chunk)) {
      chunks.push(chunk);
      frames += chunk.length;
      if (frames < SEGMENT_MIN_SECONDS * sampleRate) return;
      if (!quietest || level <= quietest.level) quietest = { index: chunks.length - 1, level };
      if (frames < SEGMENT_MAX_SECONDS * sampleRate) return;

      const rest = chunks.splice(quietest.index + 1);
      onSegment(chunks);
      chunks = rest;
      frames = rest.reduce((sum, c) => sum + c.length, 0);
      quietest = null;
    },
    /** Emits whatever is left; call once when the recording ends. */
    flush() {
      if (frames > 0) onSegment(chunks);
      chunks = [];
      frames = 0;
      quietest = null;
    },
  };
}

export async function pcmToWav(chunks: Float32Array[], sampleRate: number): Promise<Blob> {
  const length = chunks.reduce((sum, c) => sum + c.length, 0);
  const frames = Math.max(1, Math.ceil((length / sampleRate) * TARGET_RATE));
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
  const buffer = offline.createBuffer(1, Math.max(1, length), sampleRate);
  const data = buffer.getChannelData(0);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }

  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  return encodeWav(rendered.getChannelData(0), TARGET_RATE);
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
