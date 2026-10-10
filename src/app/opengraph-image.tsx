import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The picture that messengers, social networks and search engines show next to a Kiku link.
export const alt = "Kiku – Karteikarten lernen mit KI-Abgleich";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [extraBold, bold] = await Promise.all([
    readFile(join(process.cwd(), "src/assets/fonts/Nunito-ExtraBold.ttf")),
    readFile(join(process.cwd(), "src/assets/fonts/Nunito-Bold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 96px",
          background: "linear-gradient(135deg, #f8f6f2 0%, #ece9ff 100%)",
          fontFamily: "Nunito",
          color: "#1b1c2b",
        }}
      >
        {/* Same mark as icon0.svg: the K with the green check leg, on the gradient tile. */}
        <svg width="260" height="260" viewBox="0 0 512 512">
          <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#6c62ff" />
              <stop offset="1" stopColor="#4a3ee0" />
            </linearGradient>
          </defs>
          <rect width="512" height="512" rx="120" fill="url(#bg)" />
          <g strokeWidth="58" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M168 132v248" stroke="#fff" />
            <path d="M344 132L200 266" stroke="#fff" />
            <path d="M200 266l144 118" stroke="#2fc48d" />
          </g>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 72, flex: 1 }}>
          <div style={{ fontSize: 132, fontWeight: 800, lineHeight: 1, letterSpacing: -4 }}>Kiku</div>
          <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.3, marginTop: 28, color: "#3d3f55" }}>
            Karteikarten lernen: Antwort sprechen oder tippen, KI gleicht mit deiner Lösung ab.
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, marginTop: 40, color: "#5b4ff0" }}>kikucards.de</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Nunito", data: extraBold, weight: 800, style: "normal" },
        { name: "Nunito", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
