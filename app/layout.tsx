import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EdgeStack — Your Private AI Business Hub",
  description: "Local-first AI agent platform for solopreneur founders",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
