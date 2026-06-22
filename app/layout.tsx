import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PreceptaAI — Your Private AI Business Hub",
  description: "Local-first AI agent platform for solopreneur founders",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
