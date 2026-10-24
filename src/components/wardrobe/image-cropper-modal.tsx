"use client";

import { useRef, useState } from "react";
import {
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  Check,
  X,
  Crop as CropIcon,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  rotateImage,
  flipImageHorizontal,
  cropImageNormalized,
  type CropRect,
  type TransformedImageResult,
} from "@/lib/wardrobe/image-transform-client";

interface ImageCropperModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  onApply: (result: TransformedImageResult) => void;
  title?: string;
}

type AspectRatioMode = "free" | "1:1" | "4:5";

export function ImageCropperModal({
  isOpen,
  imageUrl,
  onClose,
  onApply,
  title = "Rotate & Crop Garment",
}: ImageCropperModalProps) {
  const [workingUrl, setWorkingUrl] = useState<string>(imageUrl);
  const [aspectMode, setAspectMode] = useState<AspectRatioMode>("free");
  const [isTransforming, setIsTransforming] = useState<boolean>(false);
  const [prevResetKey, setPrevResetKey] = useState<string>(`${imageUrl}|${isOpen}`);

  // Normalized crop rectangle: 0 to 1
  const [crop, setCrop] = useState<CropRect>({
    x: 0.05,
    y: 0.05,
    width: 0.9,
    height: 0.9,
  });

  const resetKey = `${imageUrl}|${isOpen}`;
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setWorkingUrl(imageUrl);
    setCrop({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
  }

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Drag interaction state
  const dragModeRef = useRef<
    | "move"
    | "nw"
    | "ne"
    | "sw"
    | "se"
    | "n"
    | "s"
    | "e"
    | "w"
    | null
  >(null);
  const startDragRef = useRef<{
    pointerX: number;
    pointerY: number;
    startCrop: CropRect;
  } | null>(null);

  // Handle Rotation 90° Clockwise
  const handleRotateCw = async () => {
    setIsTransforming(true);
    try {
      const res = await rotateImage(workingUrl, 90);
      setWorkingUrl(res.url);
      setCrop({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
    } catch (err) {
      console.error("Rotation failed:", err);
    } finally {
      setIsTransforming(false);
    }
  };

  // Handle Rotation 90° Counter-Clockwise
  const handleRotateCcw = async () => {
    setIsTransforming(true);
    try {
      const res = await rotateImage(workingUrl, -90);
      setWorkingUrl(res.url);
      setCrop({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
    } catch (err) {
      console.error("Rotation failed:", err);
    } finally {
      setIsTransforming(false);
    }
  };

  // Handle Horizontal Flip
  const handleFlip = async () => {
    setIsTransforming(true);
    try {
      const res = await flipImageHorizontal(workingUrl);
      setWorkingUrl(res.url);
      setCrop({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
    } catch (err) {
      console.error("Flip failed:", err);
    } finally {
      setIsTransforming(false);
    }
  };

  // Reset to full bounds
  const handleResetCrop = () => {
    setCrop({ x: 0.02, y: 0.02, width: 0.96, height: 0.96 });
  };

  // Pointer drag logic
  const handlePointerDown = (
    e: React.PointerEvent,
    mode: "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w",
  ) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragModeRef.current = mode;
    startDragRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startCrop: { ...crop },
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragModeRef.current || !startDragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const deltaX = (e.clientX - startDragRef.current.pointerX) / rect.width;
    const deltaY = (e.clientY - startDragRef.current.pointerY) / rect.height;
    const start = startDragRef.current.startCrop;
    const mode = dragModeRef.current;

    let newX = start.x;
    let newY = start.y;
    let newW = start.width;
    let newH = start.height;

    const MIN_SIZE = 0.15;

    if (mode === "move") {
      newX = Math.max(0, Math.min(1 - start.width, start.x + deltaX));
      newY = Math.max(0, Math.min(1 - start.height, start.y + deltaY));
    } else {
      if (mode.includes("w")) {
        const proposedW = start.width - deltaX;
        if (proposedW >= MIN_SIZE && start.x + deltaX >= 0) {
          newX = start.x + deltaX;
          newW = proposedW;
        }
      }
      if (mode.includes("e")) {
        const proposedW = start.width + deltaX;
        if (proposedW >= MIN_SIZE && start.x + proposedW <= 1) {
          newW = proposedW;
        }
      }
      if (mode.includes("n")) {
        const proposedH = start.height - deltaY;
        if (proposedH >= MIN_SIZE && start.y + deltaY >= 0) {
          newY = start.y + deltaY;
          newH = proposedH;
        }
      }
      if (mode.includes("s")) {
        const proposedH = start.height + deltaY;
        if (proposedH >= MIN_SIZE && start.y + proposedH <= 1) {
          newH = proposedH;
        }
      }

      // Enforce aspect ratio lock if requested
      if (aspectMode === "1:1") {
        const avg = Math.max(newW, newH);
        newW = Math.min(avg, 1 - newX);
        newH = Math.min(avg, 1 - newY);
      } else if (aspectMode === "4:5") {
        newH = Math.min(newW * 1.25, 1 - newY);
      }
    }

    setCrop({
      x: Math.max(0, Math.min(1 - newW, newX)),
      y: Math.max(0, Math.min(1 - newH, newY)),
      width: Math.min(1, newW),
      height: Math.min(1, newH),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    dragModeRef.current = null;
    startDragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const handleApplyCrop = async () => {
    setIsTransforming(true);
    try {
      const result = await cropImageNormalized(workingUrl, crop);
      onApply(result);
      onClose();
    } catch (err) {
      console.error("Failed to crop image:", err);
    } finally {
      setIsTransforming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col rounded-3xl border border-border bg-surface p-5 shadow-2xl space-y-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <CropIcon className="size-5 text-accent" />
            <h2 className="text-lg font-medium text-foreground">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full hover:bg-surface-muted text-muted hover:text-foreground transition"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Top Controls: Rotate & Aspect Ratio */}
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 bg-surface-muted/60 p-2 rounded-2xl border border-border/80">
          {/* Rotate Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRotateCcw}
              disabled={isTransforming}
              title="Rotate Left 90°"
              className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface border border-border shadow-2xs transition disabled:opacity-40"
            >
              <RotateCcw className="size-3.5" />
              <span>-90°</span>
            </button>
            <button
              type="button"
              onClick={handleRotateCw}
              disabled={isTransforming}
              title="Rotate Right 90°"
              className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface border border-border shadow-2xs transition disabled:opacity-40"
            >
              <RotateCw className="size-3.5" />
              <span>+90°</span>
            </button>
            <button
              type="button"
              onClick={handleFlip}
              disabled={isTransforming}
              title="Flip Horizontal"
              className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface border border-border shadow-2xs transition disabled:opacity-40"
            >
              <FlipHorizontal className="size-3.5" />
              <span>Flip</span>
            </button>
          </div>

          {/* Aspect Ratio Presets */}
          <div className="flex items-center gap-1 text-xs">
            {(["free", "1:1", "4:5"] as AspectRatioMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setAspectMode(mode)}
                className={`rounded-lg px-2.5 py-1 font-medium transition ${
                  aspectMode === mode
                    ? "bg-foreground text-background shadow-xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {mode === "free" ? "Freeform" : mode}
              </button>
            ))}
            <button
              type="button"
              onClick={handleResetCrop}
              title="Reset Crop to Maximum"
              className="rounded-lg p-1 text-muted hover:text-foreground"
            >
              <Maximize2 className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Cropper Canvas Area */}
        <div className="relative flex aspect-square w-full max-w-[24rem] sm:max-w-[26rem] mx-auto items-center justify-center overflow-hidden rounded-2xl border border-border bg-neutral-900 select-none">
          <div
            ref={containerRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative size-full overflow-hidden"
          >
            {/* Background Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={workingUrl}
              alt="Crop target"
              className="size-full object-contain pointer-events-none"
            />

            {/* Dark Mask Outside Crop Area */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.55)`,
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.width * 100}%`,
                height: `${crop.height * 100}%`,
              }}
            />

            {/* Active Crop Box & Resize Handles */}
            <div
              onPointerDown={(e) => handlePointerDown(e, "move")}
              className="absolute cursor-move border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)] touch-none"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.width * 100}%`,
                height: `${crop.height * 100}%`,
              }}
            >
              {/* Rule of Thirds Grid Lines */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
                <div className="border-r border-b border-white/60" />
                <div className="border-r border-b border-white/60" />
                <div className="border-b border-white/60" />
                <div className="border-r border-b border-white/60" />
                <div className="border-r border-b border-white/60" />
                <div className="border-b border-white/60" />
                <div className="border-r border-white/60" />
                <div className="border-r border-white/60" />
                <div />
              </div>

              {/* Corner Handles */}
              <div
                onPointerDown={(e) => handlePointerDown(e, "nw")}
                className="absolute -top-1.5 -left-1.5 size-4 cursor-nwse-resize rounded-full bg-white border border-black/40 shadow-xs"
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, "ne")}
                className="absolute -top-1.5 -right-1.5 size-4 cursor-nesw-resize rounded-full bg-white border border-black/40 shadow-xs"
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, "sw")}
                className="absolute -bottom-1.5 -left-1.5 size-4 cursor-nesw-resize rounded-full bg-white border border-black/40 shadow-xs"
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, "se")}
                className="absolute -bottom-1.5 -right-1.5 size-4 cursor-nwse-resize rounded-full bg-white border border-black/40 shadow-xs"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border pt-3 shrink-0">
          <p className="text-xs text-muted">
            Drag corners to crop. Click rotate to align garment upright.
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isTransforming}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleApplyCrop}
              loading={isTransforming}
              className="gap-1.5 px-4"
            >
              <Check className="size-3.5" />
              <span>Apply & Re-beautify</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
