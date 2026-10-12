import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export const alt = "ClosetAI — Decide What to Wear from Clothes You Already Own";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#09090b",
          backgroundImage: "radial-gradient(circle at 50% 25%, #27272a 0%, #09090b 80%)",
          fontFamily: "sans-serif",
          padding: "60px 80px",
          position: "relative",
        }}
      >
        {/* Border accent */}
        <div
          style={{
            position: "absolute",
            inset: 28,
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 28,
          }}
        />

        {/* Brand Emblem Icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 104,
            height: 104,
            borderRadius: 28,
            backgroundColor: "#18181b",
            border: "2px solid rgba(245, 158, 11, 0.4)",
            marginBottom: 28,
            boxShadow: "0 12px 35px rgba(0, 0, 0, 0.6)",
          }}
        >
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 4a3 3 0 0 0-3 3c0 1.5 1 2.5 2 3l-8 5a2 2 0 0 0 1 3h16a2 2 0 0 0 1-3l-8-5c1-.5 2-1.5 2-3a3 3 0 0 0-3-3z"
              stroke="#f59e0b"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M12 14v2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 68,
            fontWeight: 800,
            color: "#f8fafc",
            letterSpacing: "-0.03em",
            marginBottom: 16,
            textAlign: "center",
          }}
        >
          ClosetAI
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            fontWeight: 400,
            color: "#cbd5e1",
            maxWidth: 820,
            textAlign: "center",
            lineHeight: 1.4,
            marginBottom: 38,
          }}
        >
          Decide what to wear from clothes you already own.
        </div>

        {/* Feature badges */}
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
          }}
        >
          <div
            style={{
              padding: "10px 24px",
              borderRadius: 9999,
              backgroundColor: "rgba(245, 158, 11, 0.15)",
              border: "1px solid rgba(245, 158, 11, 0.45)",
              color: "#fbbf24",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            Digital Wardrobe
          </div>
          <div
            style={{
              padding: "10px 24px",
              borderRadius: 9999,
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.18)",
              color: "#f1f5f9",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            Personal AI Stylist
          </div>
          <div
            style={{
              padding: "10px 24px",
              borderRadius: 9999,
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.45)",
              color: "#f87171",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            Pinterest Lookbooks
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
