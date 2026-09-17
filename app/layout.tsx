import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://chess.leglord.com"),
  title: "MoveMirror — Chess.com & Lichess Game Analyzer",
  description:
    "Replay recent Chess.com or Lichess games to find recurring strengths, weaknesses, and the puzzle themes worth training next.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "MoveMirror — Turn your chess games into a training plan",
    description:
      "Find recurring strengths, weaknesses, evidence positions and the puzzle themes worth training next.",
    url: "/",
    siteName: "MoveMirror",
    type: "website",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
