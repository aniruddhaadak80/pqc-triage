import type { Metadata } from "next";
import { Archivo, Fraunces, Spline_Sans_Mono } from "next/font/google";
import { LIVE_URL, site } from "@/config/site";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const body = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const readout = Spline_Sans_Mono({
  subsets: ["latin"],
  variable: "--font-spline-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(LIVE_URL),
  title: {
    default: `${site.name} \u2014 ${site.tagline}`,
    template: `%s \u00b7 ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  keywords: [
    "post-quantum cryptography",
    "PQC migration",
    "NIST IR 8547",
    "ML-KEM",
    "ML-DSA",
    "harvest now decrypt later",
    "cryptographic inventory",
    "cryptographic agility",
    "quantum resource estimation",
    "MCP",
  ],
  authors: [{ name: site.name, url: site.repoUrl }],
  creator: site.name,
  category: "technology",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: LIVE_URL,
    siteName: site.name,
    title: `${site.name} \u2014 ${site.tagline}`,
    description: site.description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${site.name}: a printed diffraction plate with spectral exposure bands` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} \u2014 ${site.tagline}`,
    description: site.description,
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
  icons: { icon: "/icon.svg" },
};

export const viewport = {
  themeColor: "#f2efe7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${readout.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only-focusable absolute left-3 top-3 z-[100] bg-ink px-3 py-2 text-sm text-paper"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}