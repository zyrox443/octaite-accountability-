import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { RootProviders, themeScript } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Octaite Accountability",
  description: "Daily task planning, proof of work and approvals for small teams.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
