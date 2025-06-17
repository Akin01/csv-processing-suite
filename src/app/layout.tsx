import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DuckDBProviderWrapper } from "@/providers/duckdb-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CSV Processing Suite",
  description: "Advanced CSV processing with streaming, metrics, and DuckDB support",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <DuckDBProviderWrapper>
          {children}
        </DuckDBProviderWrapper>
      </body>
    </html>
  );
}
