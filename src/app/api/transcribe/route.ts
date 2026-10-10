import { errorResponse } from "@/lib/ai";
import { planOrDeny } from "@/server/auth";
import { transcribeAudio } from "@/server/transcribe";

// 16 kHz mono 16-bit WAV is ~32 KB/s. The client cuts long recordings into pieces of at most
// a minute (~2 MB), so every request stays below typical 4.5 MB body limits.
const MAX_BYTES = 4_200_000;

export async function POST(request: Request) {
  const plan = await planOrDeny();
  if (plan instanceof Response) return plan;
  // Free accounts transcribe with the browser's own speech recognition, see the Recorder.
  if (plan === "free") {
    return Response.json({ error: "Im kostenlosen Tarif läuft die Spracheingabe im Browser." }, { status: 403 });
  }

  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.byteLength === 0) {
    return Response.json({ error: "Keine Aufnahme erhalten." }, { status: 400 });
  }
  if (audio.byteLength > MAX_BYTES) {
    return Response.json({ error: "Die Aufnahme ist zu lang." }, { status: 413 });
  }

  try {
    return Response.json({ text: await transcribeAudio(audio) });
  } catch (error) {
    return errorResponse(error);
  }
}
