import type { Metadata } from "next";
import "./globals.css";

const assetRoot = process.env.GITHUB_ACTIONS === "true" ? "/movemirror" : "";

export const metadata: Metadata = {
  title: "MoveMirror — Chess.com Strength & Weakness Analyzer",
  description:
    "Replay recent Chess.com games to find recurring strengths, weaknesses, and the puzzle themes worth training next.",
  icons: {
    icon: `${assetRoot}/favicon.svg`,
    shortcut: `${assetRoot}/favicon.svg`,
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
