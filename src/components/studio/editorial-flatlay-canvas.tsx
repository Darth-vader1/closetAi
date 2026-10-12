"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Download, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WardrobeItem } from "@/lib/wardrobe/queries";
import { categoryGroup } from "@/lib/wardrobe/categories";

interface EditorialFlatlayCanvasProps {
  items: WardrobeItem[];
  imageUrls: Record<string, string>;
  outfitName: string;
  className?: string;
  onExportBlob?: (blob: Blob) => void;
}

export function EditorialFlatlayCanvas({
  items,
  imageUrls,
  outfitName,
  className = "",
  onExportBlob,
}: EditorialFlatlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const drawCollage = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setLoading(true);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // High-resolution Instagram/Pinterest editorial canvas ratio (1200 x 1500)
    const W = 1200;
    const H = 1500;
    canvas.width = W;
    canvas.height = H;

    // 1. Studio backdrop: warm luxury linen/limewash gradient
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, "#fcfaf7");
    bgGrad.addColorStop(0.5, "#f6f1ea");
    bgGrad.addColorStop(1, "#eee6dc");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle editorial border frame
    ctx.strokeStyle = "#e2d9cd";
    ctx.lineWidth = 2;
    ctx.strokeRect(36, 36, W - 72, H - 72);

    // Inner hairline frame
    ctx.strokeStyle = "#ebe3d8";
    ctx.lineWidth = 1;
    ctx.strokeRect(48, 48, W - 96, H - 96);

    // 2. Load the actual garment photos
    const loadedImages: Array<{ img: HTMLImageElement; item: WardrobeItem }> = [];
    for (const item of items) {
      const url = imageUrls[item.imagePath];
      if (!url) continue;
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new window.Image();
          image.crossOrigin = "anonymous";
          image.onload = () => resolve(image);
          image.onerror = (e) => reject(e);
          image.src = url;
        });
        loadedImages.push({ img, item });
      } catch (err) {
        console.warn("Failed to load item for flatlay:", item.name, err);
      }
    }

    // 3. Separate categories for intentional editorial layout
    const tops = loadedImages.filter((l) => categoryGroup(l.item.category) === "top" || categoryGroup(l.item.category) === "outerwear");
    const bottoms = loadedImages.filter((l) => categoryGroup(l.item.category) === "bottom");
    const fullbodies = loadedImages.filter((l) => categoryGroup(l.item.category) === "fullbody" || categoryGroup(l.item.category) === "traditional");
    const shoes = loadedImages.filter((l) => categoryGroup(l.item.category) === "footwear");
    const others = loadedImages.filter((l) => categoryGroup(l.item.category) === "accessory" || categoryGroup(l.item.category) === "other");

    // Helper to draw garment with realistic soft grounding shadow
    const drawGarment = (
      img: HTMLImageElement,
      cx: number,
      cy: number,
      maxW: number,
      maxH: number,
      rotationRad = 0,
    ) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotationRad);

      const aspect = img.width / img.height;
      let targetW = maxW;
      let targetH = maxW / aspect;
      if (targetH > maxH) {
        targetH = maxH;
        targetW = maxH * aspect;
      }

      const dx = -targetW / 2;
      const dy = -targetH / 2;

      // Contact & soft ambient drop shadow
      ctx.shadowColor = "rgba(40, 30, 20, 0.16)";
      ctx.shadowBlur = 32;
      ctx.shadowOffsetX = 12;
      ctx.shadowOffsetY = 24;

      // Draw the actual garment photo
      ctx.drawImage(img, dx, dy, targetW, targetH);
      ctx.restore();
    };

    // 4. Arrange the pieces like a Vogue / GQ flatlay photoshoot
    if (fullbodies.length > 0) {
      drawGarment(fullbodies[0].img, W / 2, H * 0.44, W * 0.65, H * 0.65, -0.02);
      if (shoes.length > 0) {
        drawGarment(shoes[0].img, W / 2, H * 0.82, W * 0.38, H * 0.28, 0.05);
      }
      if (others.length > 0) {
        drawGarment(others[0].img, W * 0.8, H * 0.3, W * 0.28, H * 0.25, 0.1);
      }
    } else {
      // Top garment (center upper)
      if (tops.length > 0) {
        drawGarment(tops[0].img, W * 0.46, H * 0.34, W * 0.52, H * 0.44, -0.03);
      }
      // If there's a jacket or second top
      if (tops.length > 1) {
        drawGarment(tops[1].img, W * 0.68, H * 0.32, W * 0.45, H * 0.42, 0.06);
      }
      // Bottom garment (arranged naturally below/under the top)
      if (bottoms.length > 0) {
        drawGarment(bottoms[0].img, W * 0.52, H * 0.66, W * 0.48, H * 0.48, 0.02);
      }
      // Shoes (grounded bottom right or left)
      if (shoes.length > 0) {
        drawGarment(shoes[0].img, W * 0.72, H * 0.85, W * 0.32, H * 0.26, -0.08);
      }
      // Accessories (offset elegantly)
      if (others.length > 0) {
        drawGarment(others[0].img, W * 0.24, H * 0.76, W * 0.28, H * 0.24, 0.08);
      }
    }

    // 5. Editorial Typography Header & Footer
    ctx.save();
    ctx.shadowColor = "transparent";

    // Top Brand Tag
    ctx.font = "italic 500 24px 'Fraunces', serif";
    ctx.fillStyle = "#9a4a2f";
    ctx.textAlign = "center";
    ctx.fillText("ClosetAI · Editorial Lookbook", W / 2, 92);

    // Outfit Name Banner at the bottom
    ctx.font = "600 36px 'Fraunces', serif";
    ctx.fillStyle = "#23211e";
    ctx.textAlign = "center";
    ctx.fillText(outfitName, W / 2, H - 98);

    // Garment pieces caption subtitle
    ctx.font = "400 18px 'Inter', sans-serif";
    ctx.fillStyle = "#6b655c";
    const piecesLabel = items.map((i) => i.name).slice(0, 3).join("  ·  ");
    ctx.fillText(piecesLabel, W / 2, H - 68);

    ctx.restore();

    // 6. Export to high-res data URL and Blob
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setRenderedUrl(url);
          onExportBlob?.(blob);
        }
        setLoading(false);
      },
      "image/jpeg",
      0.95,
    );
  }, [items, imageUrls, outfitName, onExportBlob]);

  useEffect(() => {
    drawCollage();
  }, [drawCollage]);

  const handleDownload = () => {
    if (!renderedUrl) return;
    const a = document.createElement("a");
    a.href = renderedUrl;
    a.download = `${outfitName.toLowerCase().replace(/\s+/g, "-")}-lookbook.jpg`;
    a.click();
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border bg-surface shadow-md ${className}`}>
      {/* Hidden high-res canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Rendered Preview */}
      <div className="relative aspect-[4/5] w-full max-h-[580px] bg-surface-muted flex items-center justify-center">
        {loading || !renderedUrl ? (
          <div className="flex flex-col items-center gap-3 text-muted text-xs">
            <RefreshCw className="h-6 w-6 animate-spin text-accent" />
            <span>Assembling your editorial flatlay photoshoot...</span>
          </div>
        ) : (
          <Image
            src={renderedUrl}
            alt={outfitName}
            fill
            sizes="(max-width: 1024px) 100vw, 60vw"
            className="object-contain"
          />
        )}
      </div>

      {/* Floating Toolbar */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 rounded-full bg-background/85 px-3 py-1 text-xs font-medium backdrop-blur-md border border-border pointer-events-auto">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          <span>True Wardrobe Flatlay · 100% Your Real Clothes</span>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleDownload}
          disabled={!renderedUrl}
          className="rounded-full bg-background/90 text-xs gap-1.5 shadow-sm border-border backdrop-blur-md pointer-events-auto"
        >
          <Download className="h-3.5 w-3.5" />
          Save Photo
        </Button>
      </div>
    </div>
  );
}
