import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The picture that messengers, social networks and search engines show next to a Kiku link.
export const alt = "kiku – Karteikarten lernen mit KI-Abgleich";
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
        {/* Same mark as icon0.svg: "kiku" with the green k legs, no tile. */}
        <svg width="400" height="244" viewBox="62 134 408 248">
          <g stroke="#5b4ff0" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M84 156v204" />
            <path d="M150 244L102 296" />
            <path d="M102 296l48 64" stroke="#2fc48d" />
            <path d="M206 250v110" />
            <path d="M206 168v.5" />
            <path d="M262 156v204" />
            <path d="M328 244L280 296" />
            <path d="M280 296l48 64" stroke="#2fc48d" />
            <path d="M384 250v68a32 32 0 0 0 64 0" />
            <path d="M448 250v110" />
          </g>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 72, flex: 1 }}>
          <div style={{ fontSize: 132, fontWeight: 800, lineHeight: 1, letterSpacing: -4 }}>kiku</div>
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
