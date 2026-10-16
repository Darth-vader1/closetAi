import type { MetadataRoute } from "next";

const PRODUCTION_URL = "https://closet-ai-official.vercel.app";

function resolveSiteOrigin(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
      : undefined,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : undefined,
  ];

  for (const raw of candidates) {
    if (!raw || raw.includes("localhost") || raw.includes("127.0.0.1")) continue;
    try {
      const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      return new URL(withProtocol).origin;
    } catch {
      continue;
    }
  }

  return PRODUCTION_URL;
}

export default function robots(): MetadataRoute.Robots {
  const origin = resolveSiteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup", "/privacy", "/terms", "/contact"],
        disallow: [
          "/api/",
          "/auth/",
          "/dashboard",
          "/wardrobe",
          "/outfits",
          "/studio",
          "/packing",
          "/laundry",
          "/calendar",
          "/analytics",
          "/connect",
          "/settings",
          "/onboarding",
          "/reset-password",
          "/forgot-password",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
