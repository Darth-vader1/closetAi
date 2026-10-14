import type { NextConfig } from "next";

/**
 * Architecture note: Cache Components (cacheComponents / partialPrefetching) is
 * deliberately disabled. Nearly every ClosetAI page is per-user and reads the
 * Supabase session at request time, so there is no meaningful static shell to
 * prerender. Revisit if public marketing pages need component-level caching.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  logging: {
    serverFunctions: false,
  },
  allowedDevOrigins: [
    "skinking-emeline-unappareled.ngrok-free.dev",
    "*.ngrok-free.dev",
    "*.ngrok.app",
    "*.ngrok-free.app",
  ],
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // Wardrobe photos are private and served through short-lived signed URLs
    // from Supabase Storage. Two URL patterns are allowed:
    //
    //  1. /storage/v1/object/sign/**   — plain signed URLs (original size)
    //  2. /storage/v1/render/image/sign/** — transform-signed URLs (resize + WebP)
    //
    // Only the project's own Supabase hostname is permitted; public storage
    // URLs (/object/public/**) are deliberately excluded because the bucket
    // is private. Both patterns are scoped to a single hostname so the
    // allowlist is as narrow as possible.
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? (() => {
          const hostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
          return [
            {
              protocol: "https" as const,
              hostname,
              pathname: "/storage/v1/object/sign/**",
            },
            {
              protocol: "https" as const,
              hostname,
              // Supabase image-transform endpoint: /render/image/sign/<bucket>/<path>
              pathname: "/storage/v1/render/image/sign/**",
            },
          ];
        })()
      : [],
    // Serve modern formats where supported. next/image will prefer AVIF then
    // WebP automatically; Supabase's transform endpoint also outputs WebP when
    // the Accept header requests it, so these work together.
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
