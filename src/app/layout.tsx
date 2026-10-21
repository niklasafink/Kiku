import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { Analytics } from "@website/Analytics";
import { SERVER_MODE } from "@/server/auth";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const DESCRIPTION = "Karteikarten lernen: Antwort sprechen oder tippen, KI gleicht mit deiner Lösung ab.";

// Link previews need absolute image URLs; the hosted app lives at kikucards.de, a local
// install has no public address and Next falls back to the request host.
const SITE_URL = SERVER_MODE ? "https://kikucards.de" : undefined;

export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
  title: "kiku",
  description: DESCRIPTION,
  applicationName: "kiku",
  appleWebApp: { capable: true, title: "kiku", statusBarStyle: "default" },
  // Only the pages of the website ask to be indexed (see their metadata); the app behind the
  // login, shared folders and the sign-in forms stay out of search results.
  robots: { index: false, follow: true },
  // Title and description come from each page; the image is the one next to this file.
  openGraph: { type: "website", siteName: "Kiku", locale: "de_DE" },
  twitter: { card: "summary_large_image" },
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
