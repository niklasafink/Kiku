import type { NextConfig } from "next";

// Sent with every response. The policy allows what the app uses (microphone for spoken answers,
// screen wake lock while recording, clipboard for share links) and switches off the rest; the
// CSP only forbids framing, plugins and foreign <base> tags, since scripts and styles come from
// Next, DataFast and inline theme code.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "microphone=(self), screen-wake-lock=(self), clipboard-write=(self), camera=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests" },
];

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
