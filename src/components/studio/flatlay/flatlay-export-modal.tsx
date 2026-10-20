"use client";

import { useState } from "react";
import { Download, Share2, Sparkles, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type Konva from "konva";

interface FlatlayExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardName: string;
  stageRef: React.RefObject<Konva.Stage | null>;
  onDeselect: () => void;
  canvasWidth: number;
  canvasHeight: number;
}

export function FlatlayExportModal({
  isOpen,
  onClose,
  boardName,
  stageRef,
  onDeselect,
  canvasWidth,
  canvasHeight,
}: FlatlayExportModalProps) {
  const [resolution, setResolution] = useState<2 | 1>(2);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownload = async () => {
    const stage = stageRef.current;
    if (!stage) {
      setError("Canvas is not ready for export.");
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      // 1. Temporarily deselect any active transformer handles so export is pure artwork
      onDeselect();
      // Allow react-konva a tick to redraw without transformer
      await new Promise((resolve) => setTimeout(resolve, 80));

      const dataUrl = stage.toDataURL({
        pixelRatio: resolution,
        mimeType: "image/png",
      });

      const safeName = (boardName || "closetai-flatlay")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // Check if Web Share API with files is supported (iOS / Android)
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `${safeName}.png`, { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: boardName,
            text: "Styled with ClosetAI Flatlay Studio",
          });
          setIsExporting(false);
          onClose();
          return;
        } catch (shareErr) {
          // If user cancelled share sheet, don't fallback to error
          if ((shareErr as Error).name === "AbortError") {
            setIsExporting(false);
            return;
          }
        }
      }

      // Default desktop download
      const link = document.createElement("a");
      link.download = `${safeName}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setIsExporting(false);
      onClose();
    } catch (err) {
      console.error("Export failed:", err);
      setError("Failed to export image. Please try again.");
      setIsExporting(false);
    }
  };

  const outputW = canvasWidth * resolution;
  const outputH = canvasHeight * resolution;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-sm rounded-3xl border border-border bg-surface p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Download className="size-5 text-accent" />
            <h2 className="text-xl font-medium">Export Flatlay</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full hover:bg-surface-muted text-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger-soft/40 p-3 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <label className="text-xs font-medium text-muted block">Output Quality:</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setResolution(2)}
              className={`flex flex-col rounded-2xl border p-3 text-left transition ${
                resolution === 2
                  ? "border-accent bg-accent-soft/30 ring-1 ring-accent"
                  : "border-border bg-surface hover:bg-surface-muted"
              }`}
            >
              <span className="text-xs font-semibold text-foreground">Ultra HD (2x)</span>
              <span className="text-[11px] text-muted">{canvasWidth * 2} × {canvasHeight * 2}px</span>
              <span className="mt-1 text-[10px] text-accent font-medium">Best for Instagram</span>
            </button>

            <button
              type="button"
              onClick={() => setResolution(1)}
              className={`flex flex-col rounded-2xl border p-3 text-left transition ${
                resolution === 1
                  ? "border-accent bg-accent-soft/30 ring-1 ring-accent"
                  : "border-border bg-surface hover:bg-surface-muted"
              }`}
            >
              <span className="text-xs font-semibold text-foreground">Standard (1x)</span>
              <span className="text-[11px] text-muted">{canvasWidth} × {canvasHeight}px</span>
              <span className="mt-1 text-[10px] text-muted">Compact file size</span>
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface-muted/50 p-3 text-[11px] text-muted space-y-1">
          <p>Format: <strong>High-Resolution PNG</strong></p>
          <p>Dimensions: <strong>{outputW} × {outputH} px</strong></p>
          <p>Editor handles and borders are automatically hidden in the download.</p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleDownload}
            loading={isExporting}
            className="gap-1.5"
          >
            <Download className="size-3.5" />
            <span>Download PNG</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
