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
    "ClosetAI is your digital wardrobe and personal AI stylist. Photograph your clothes, track what's clean, explore Pinterest moodboards, and get outfit ideas built only from garments ready to wear.",
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
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ClosetAI",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/icon.svg"],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "ClosetAI",
    title: "ClosetAI — Decide What to Wear from Clothes You Already Own",
    description:
      "Your digital wardrobe and personal AI stylist. Photograph your clothes, track laundry status, and get outfit recommendations built only from clean clothes.",
    images: [
      {
        url: "/icon.svg",
        width: 512,
        height: 512,
        alt: "ClosetAI — Digital Wardrobe & AI Stylist Emblem",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ClosetAI — Decide What to Wear from Clothes You Already Own",
    description:
      "Your digital wardrobe and personal AI stylist. Grounded in clothes that are clean and ready to wear.",
    images: ["/icon.svg"],
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
