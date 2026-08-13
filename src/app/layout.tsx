import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

// globals.css maps --font-sans → the Tailwind `font-sans` utility, so this
// variable must be named --font-sans (not --font-geist-sans) or everything
// silently falls back to Times.
const geistSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Blockworks Proposals",
  description: "Custom sponsorship proposals for Digital Asset Summit.",
  // The Blockworks mark, so proposal links and browser tabs stop showing the
  // default Vercel favicon. Served straight from /public — no dependency on
  // the app-directory icon convention.
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
