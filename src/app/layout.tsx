import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "ClosetAI — Decide What to Wear from Clothes You Already Own",
    template: "%s · ClosetAI",
  },
  description:
    "Digital wardrobe & personal AI stylist. Catalogue clothes, track laundry, and get outfit ideas from ready-to-wear pieces.",
  applicationName: "ClosetAI",
  authors: [{ name: "ClosetAI Team" }],
  generator: "Next.js",
  keywords: [
    "digital wardrobe",
    "AI stylist",
    "capsule wardrobe",
    "outfit planner",
    "wardrobe assistant",
    "sustainable fashion",
    "clean clothes tracker",
    "Pinterest aesthetic outfits",
    "outfit generator",
  ],
  referrer: "origin-when-cross-origin",
  creator: "ClosetAI",
  publisher: "ClosetAI",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ClosetAI",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/icon-192.png"],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "ClosetAI",
    title: "ClosetAI — Decide What to Wear from Clothes You Already Own",
    description:
      "Digital wardrobe & personal AI stylist. Outfit ideas built only from clothes ready to wear.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "ClosetAI — Digital Wardrobe & Personal AI Stylist",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ClosetAI — Decide What to Wear from Clothes You Already Own",
    description:
      "Digital wardrobe & personal AI stylist. Outfit ideas built only from clothes ready to wear.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
