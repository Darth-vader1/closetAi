import type { WardrobeItem } from "@/lib/wardrobe/queries";

export type FlatlayPreset = "collage" | "editorial" | "streetwear" | "minimal" | "catalogue";

export type FlatlayAspectRatio = "1:1" | "4:5" | "9:16" | "16:9";

export type FlatlayBackgroundStyle = "plain" | "linen" | "limewash" | "editorial_frame" | "dark";

export interface FlatlayCanvasDimensions {
  width: number;
  height: number;
  label: string;
}

export const CANVAS_ASPECT_RATIOS: Record<FlatlayAspectRatio, FlatlayCanvasDimensions> = {
  "4:5": { width: 1200, height: 1500, label: "Portrait / Instagram (4:5)" },
  "1:1": { width: 1200, height: 1200, label: "Square (1:1)" },
  "9:16": { width: 1080, height: 1920, label: "Story / Reels (9:16)" },
  "16:9": { width: 1600, height: 900, label: "Landscape (16:9)" },
};

export const FLATLAY_BACKGROUND_COLORS = [
  { label: "Warm Linen (Default)", value: "#fcfaf7", textColor: "#23211e" },
  { label: "Pure White", value: "#ffffff", textColor: "#23211e" },
  { label: "Soft Cream", value: "#f6f1ea", textColor: "#23211e" },
  { label: "Oatmeal Grey", value: "#eee6dc", textColor: "#23211e" },
  { label: "Cool Light Grey", value: "#f0f2f5", textColor: "#1e293b" },
  { label: "Terracotta Tint", value: "#faf0eb", textColor: "#431407" },
  { label: "Sage Neutral", value: "#eff4f1", textColor: "#142d1f" },
  { label: "Charcoal Dark", value: "#1e1e20", textColor: "#f8fafc" },
  { label: "Pitch Black", value: "#0c0a09", textColor: "#f8fafc" },
] as const;

export interface FlatlayItem {
  id: string; // unique canvas element ID
  wardrobeItemId: string;
  name: string;
  category: string;
  imagePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees (-180 to 180)
  scaleX: number;
  scaleY: number;
  zIndex: number;
  locked?: boolean;
  hidden?: boolean;
  shadow?: boolean;
}

export interface FlatlayComposition {
  id: string;
  userId: string;
  name: string;
  preset: FlatlayPreset;
  aspectRatio: FlatlayAspectRatio;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  backgroundStyle: FlatlayBackgroundStyle;
  items: FlatlayItem[];
  thumbnailPath?: string | null;
  outfitId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlatlayCompositionWithUrls extends FlatlayComposition {
  imageUrls: Record<string, string>; // imagePath -> signedUrl
  thumbnailUrl?: string | null;
  wardrobeItems?: WardrobeItem[];
}
