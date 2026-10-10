import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { AppShell } from "@/components/AppShell";
// Part of the marketing website (src/app/(website)); without it the import falls back to src/websiteFallback.
import { Analytics } from "@website/Analytics";
import { SERVER_MODE } from "@/server/auth";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kiku",
  description: "Karteikarten lernen: Antwort sprechen oder tippen, KI gleicht mit deiner Lösung ab.",
  appleWebApp: { capable: true, title: "Kiku", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1c2b" },
  ],
};

// Applies a manually chosen theme before first paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${nunito.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full font-sans">
        <AppShell serverMode={SERVER_MODE}>{children}</AppShell>
        {SERVER_MODE && <Analytics />}
      </body>
    </html>
  );
}
