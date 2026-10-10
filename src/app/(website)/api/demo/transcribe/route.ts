import { errorResponse } from "@/lib/ai";
import { SERVER_MODE } from "@/server/auth";
import { getDb } from "@/server/db";
import { clientIp, refundDemoQuota, takeDemoQuota } from "@/server/demo";
import { transcribeAudio } from "@/server/transcribe";

// One piece of a recording, at most a minute long (see the regular transcribe route).
const MAX_BYTES = 4_200_000;

export async function POST(request: Request) {
  if (!SERVER_MODE) return Response.json({ error: "Not available in local mode." }, { status: 404 });

  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.byteLength === 0) {
    return Response.json({ error: "Keine Aufnahme erhalten." }, { status: 400 });
  }
  if (audio.byteLength > MAX_BYTES) {
    return Response.json({ error: "Die Aufnahme ist zu lang." }, { status: 413 });
  }

  const db = getDb();
  const ip = clientIp(request);
  if ((await takeDemoQuota(db, "transcribe", ip)) === null) {
    return Response.json(
      { error: "Für heute sind die Probe-Aufnahmen aufgebraucht. Du kannst deine Antwort noch tippen." },
      { status: 429 },
    );
  }

  try {
    return Response.json({ text: await transcribeAudio(audio) });
  } catch (error) {
    await refundDemoQuota(db, "transcribe", ip).catch(() => {});
    return errorResponse(error);
  }
}
