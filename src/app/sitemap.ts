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

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = resolveSiteOrigin();
  const now = new Date();

  return [
    {
      url: origin,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${origin}/signup`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${origin}/login`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${origin}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${origin}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${origin}/contact`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];
}
