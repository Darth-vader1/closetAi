import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClosetAI — Digital Wardrobe & AI Stylist",
    short_name: "ClosetAI",
    description: "Decide what to wear from clothes you already own. Digital wardrobe and personal AI stylist.",
    start_url: "/wardrobe",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#18181b",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
