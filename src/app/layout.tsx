import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted from npm (@fontsource, SIL OFL 1.1) so builds never depend on fetching Google
// Fonts — a malformed Google response broke a CI build on 2026-11-04.
const sourceSerif = localFont({
  variable: "--font-source-serif",
  src: "../../node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2",
  weight: "200 900",
  display: "swap",
});

const sourceSans = localFont({
  variable: "--font-source-sans",
  src: "../../node_modules/@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2",
  weight: "200 900",
  display: "swap",
});

const plexMono = localFont({
  variable: "--font-plex-mono",
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2", weight: "600" },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Election Tracker — 2026 Midterms",
  description:
    "Live results for the Nov 3, 2026 US midterms: Senate, House, Governors and ballot measures. Source-labeled; never projects.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/** Root layout: loads the Option B type stack and global styles. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sourceSerif.variable} ${sourceSans.variable} ${plexMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
