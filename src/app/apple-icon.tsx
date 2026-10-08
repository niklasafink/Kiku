import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Same picture as icon.svg: the K with the green check leg, on the gradient tile.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6c62ff, #4a3ee0)",
        }}
      >
        <svg width="180" height="180" viewBox="0 0 512 512">
          <g strokeWidth="58" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M168 132v248" stroke="#fff" />
            <path d="M344 132L200 266" stroke="#fff" />
            <path d="M200 266l144 118" stroke="#2fc48d" />
          </g>
        </svg>
      </div>
    ),
    size,
  );
}
