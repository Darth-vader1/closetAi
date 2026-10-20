"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  Columns2,
  Crop,
  Eraser,
  Loader2,
  Paintbrush,
  RefreshCw,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import {
  getItemBeautifyUrlsAction,
  saveBeautifiedImageAction,
  switchItemImageVersionAction,
} from "@/app/(app)/wardrobe/actions";
import { Button } from "@/components/ui/button";
import { FavouriteButton } from "@/components/wardrobe/favourite-button";
import { ImageCropperModal } from "@/components/wardrobe/image-cropper-modal";
import { ItemImage } from "@/components/wardrobe/item-image";
import type {
  AiEnhancementParams,
  BeautificationMode,
  BeautifyQualityDiagnostics,
} from "@/lib/wardrobe/beautify-engine";
import { categoryLabel } from "@/lib/wardrobe/categories";
import {
  rotateImage,
  type TransformedImageResult,
} from "@/lib/wardrobe/image-transform-client";
import { beautifyGarmentImage } from "@/lib/wardrobe/studio-canvas";
import { uploadPhoto } from "@/lib/wardrobe/upload-client";

interface ItemBeautifyCardProps {
  id: string;
  name: string;
  category: string;
  isFavourite: boolean;
  activeImagePath: string;
  originalImagePath: string;
  beautifiedImagePath: string | null;
  beautificationMode: BeautificationMode | null;
  activeImageUrl?: string;
  originalImageUrl?: string;
  beautifiedImageUrl?: string;
}

export function ItemBeautifyCard({
  id,
  name,
  category,
  isFavourite,
  activeImagePath: initialActivePath,
  originalImagePath,
  beautifiedImagePath: initialBeautifiedPath,
  beautificationMode: initialMode,
  activeImageUrl: initialActiveUrl,
  originalImageUrl: initialOriginalUrl,
  beautifiedImageUrl: initialBeautifiedUrl,
}: ItemBeautifyCardProps) {
  const [activePath, setActivePath] = useState(initialActivePath);
  const [beautifiedPath, setBeautifiedPath] = useState<string | null>(
    initialBeautifiedPath,
  );
  const [modeUsed, setModeUsed] = useState<BeautificationMode | null>(
    initialMode,
  );
  const [activeUrl, setActiveUrl] = useState<string | undefined>(
    initialActiveUrl,
  );
  const [originalUrl, setOriginalUrl] = useState<string | undefined>(
    initialOriginalUrl ?? initialActiveUrl,
  );
  const [beautifiedUrl, setBeautifiedUrl] = useState<string | undefined>(
    initialBeautifiedUrl,
  );
  const [switchingVersion, setSwitchingVersion] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    open: boolean;
    initialMode: BeautificationMode;
    initialCompareView: "slider" | "side-by-side" | "refine";
    inspectExistingOnly?: boolean;
  }>({
    open: false,
    initialMode: initialMode ?? "clean-cutout",
    initialCompareView: "slider",
    inspectExistingOnly: false,
  });
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const hasBothVersions = Boolean(
    beautifiedPath && beautifiedPath !== originalImagePath,
  );
  const isShowingBeautified =
    hasBothVersions && activePath === beautifiedPath;

  async function handleSwitchVersion(target: "original" | "beautified") {
    if (switchingVersion) return;
    if (
      (target === "beautified" && isShowingBeautified) ||
      (target === "original" && !isShowingBeautified)
    ) {
      return;
    }

    setSwitchingVersion(true);
    setFeedback(null);
    try {
      const res = await switchItemImageVersionAction(id, target);
      if (!res.ok) {
        setFeedback({ tone: "error", text: res.error });
        return;
      }
      setActivePath(res.activeImagePath);
      if (res.activeImageUrl) {
        setActiveUrl(res.activeImageUrl);
      } else if (target === "original" && originalUrl) {
        setActiveUrl(originalUrl);
      } else if (target === "beautified" && beautifiedUrl) {
        setActiveUrl(beautifiedUrl);
      }
      setFeedback({
        tone: "success",
        text:
          target === "beautified"
            ? "Switched to processed Product Studio image."
            : "Restored original uploaded photo.",
      });
    } finally {
      setSwitchingVersion(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-[1.25rem] border border-border bg-surface">
        <ItemImage
          url={activeUrl}
          alt={name}
          className="aspect-[4/5] w-full"
          sizes="(max-width: 1024px) 100vw, 26rem"
          priority
        />
        <FavouriteButton
          id={id}
          name={name}
          isFavourite={isFavourite}
          className="absolute right-3 top-3"
        />

        {isShowingBeautified && (
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface/90 px-2.5 py-1 text-[11px] font-medium text-foreground backdrop-blur-sm">
            <Sparkles className="size-3 text-accent" aria-hidden />
            {modeUsed === "catalog-flatlay"
              ? "AI Flat-Lay"
              : modeUsed === "ai-enhance"
                ? "AI Enhanced"
                : "Clean Cutout"}
          </div>
        )}
      </div>

      {/* Product Studio Actions: 1. Clean Cutout, 2. AI Enhance, 3. Compare */}
      <div className="rounded-2xl border border-border bg-surface p-3.5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Product Studio
            </p>
            <p className="text-xs text-muted">
              {hasBothVersions
                ? "Original photo is safely preserved alongside your studio cutout."
                : "Create a clean white-background cutout or reduce fabric wrinkles."}
            </p>
          </div>
        </div>

        <p className="mt-2 rounded-xl border border-border/70 bg-surface-muted/60 px-2.5 py-1.5 text-[11px] text-muted">
          <strong>Privacy notice:</strong> Running Clean Cutout or AI Enhance uses <strong>ClearBackdrop / Remove BG</strong> neural segmentation (and AI Vision for lighting/wrinkle calibration). Your original photo is preserved.
        </p>

        <div
          className="mt-3 grid grid-cols-3 gap-1 sm:gap-1.5"
          role="group"
          aria-label="Product Studio actions"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setModalConfig({
                open: true,
                initialMode: "clean-cutout",
                initialCompareView: "slider",
                inspectExistingOnly: false,
              })
            }
            className="px-1 sm:px-2 text-[11px] sm:text-xs"
          >
            <Wand2 className="size-3 sm:size-3.5 shrink-0 text-accent" aria-hidden />
            <span className="truncate">Clean Cutout</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setModalConfig({
                open: true,
                initialMode: "ai-enhance",
                initialCompareView: "slider",
                inspectExistingOnly: false,
              })
            }
            className="px-1 sm:px-2 text-[11px] sm:text-xs"
          >
            <Sparkles className="size-3 sm:size-3.5 shrink-0 text-accent" aria-hidden />
            <span className="truncate">AI Enhance</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setModalConfig({
                open: true,
                initialMode: modeUsed ?? "clean-cutout",
                initialCompareView: "side-by-side",
                inspectExistingOnly: hasBothVersions,
              })
            }
            className="px-1 sm:px-2 text-[11px] sm:text-xs"
          >
            <Columns2 className="size-3 sm:size-3.5 shrink-0 text-accent" aria-hidden />
            <span className="truncate">Compare</span>
          </Button>
        </div>

        {hasBothVersions && (
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            <div
              className="grid grid-cols-2 gap-1.5 rounded-xl bg-surface-muted p-1"
              role="group"
              aria-label="Garment image version"
            >
              <button
                type="button"
                disabled={switchingVersion}
                onClick={() => handleSwitchVersion("original")}
                className={`flex min-h-8 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  !isShowingBeautified
                    ? "bg-surface text-foreground shadow-xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <RotateCcw className="size-3" aria-hidden />
                Restore Original
              </button>
              <button
                type="button"
                disabled={switchingVersion}
                onClick={() => handleSwitchVersion("beautified")}
                className={`flex min-h-8 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  isShowingBeautified
                    ? "bg-surface text-foreground shadow-xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Sparkles className="size-3 text-accent" aria-hidden />
                Studio Processed
              </button>
            </div>
          </div>
        )}

        {feedback && (
          <p
            role="status"
            className={`mt-2.5 text-xs ${
              feedback.tone === "error" ? "text-danger" : "text-muted"
            }`}
          >
            {feedback.text}
          </p>
        )}
      </div>

      {modalConfig.open && (
        <BeautifyExistingItemModal
          itemId={id}
          itemName={name}
          category={category}
          originalImagePath={originalImagePath}
          initialOriginalUrl={originalUrl}
          initialBeautifiedUrl={beautifiedUrl}
          initialMode={modalConfig.initialMode}
          initialCompareView={modalConfig.initialCompareView}
          inspectExistingOnly={modalConfig.inspectExistingOnly}
          hasSavedBeautified={hasBothVersions}
          isShowingBeautified={isShowingBeautified}
          onClose={() =>
            setModalConfig((prev) => ({ ...prev, open: false }))
          }
          onRestoreOriginal={async () => {
            await handleSwitchVersion("original");
            setModalConfig((prev) => ({ ...prev, open: false }));
          }}
          onAccepted={(res) => {
            setActivePath(res.activeImagePath);
            setBeautifiedPath(res.activeImagePath);
            setModeUsed(res.beautificationMode);
            if (res.activeImageUrl) setActiveUrl(res.activeImageUrl);
            if (res.originalImageUrl) setOriginalUrl(res.originalImageUrl);
            if (res.beautifiedImageUrl)
              setBeautifiedUrl(res.beautifiedImageUrl);
            setFeedback({
              tone: "success",
              text:
                res.beautificationMode === "ai-enhance"
                  ? "Saved AI-enhanced studio image (wrinkles reduced & lighting balanced). Original photo preserved."
                  : "Saved clean studio cutout (#FFFFFF). Original photo preserved.",
            });
            setModalConfig((prev) => ({ ...prev, open: false }));
          }}
        />
      )}
    </div>
  );
}

interface BeautifyExistingItemModalProps {
  itemId: string;
  itemName: string;
  category: string;
  originalImagePath: string;
  initialOriginalUrl?: string;
  initialBeautifiedUrl?: string;
  initialMode: BeautificationMode;
  initialCompareView: "slider" | "side-by-side" | "refine";
  inspectExistingOnly?: boolean;
  hasSavedBeautified: boolean;
  isShowingBeautified: boolean;
  onClose: () => void;
  onRestoreOriginal: () => Promise<void>;
  onAccepted: (res: {
    activeImagePath: string;
    activeImageUrl: string | null;
    originalImageUrl: string | null;
    beautifiedImageUrl: string | null;
    beautificationMode: BeautificationMode;
  }) => void;
}

interface CachedPreviewEntry {
  blob: Blob;
  url: string;
  diagnostics: BeautifyQualityDiagnostics;
  provider: string;
  model: string;
}

interface TouchUpCanvasEditorProps {
  sourceImageUrl: string;
  cutoutImageUrl: string;
  onApply: (blob: Blob) => void;
  onCancel: () => void;
}

function TouchUpCanvasEditor({
  sourceImageUrl,
  cutoutImageUrl,
  onApply,
  onCancel,
}: TouchUpCanvasEditorProps) {
  const [brushMode, setBrushMode] = useState<"erase" | "restore">("erase");
  const [brushSize, setBrushSize] = useState<number>(24);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState<number>(0);
  const [cursorPos, setCursorPos] = useState<{
    x: number;
    y: number;
    visible: boolean;
  }>({
    x: 0,
    y: 0,
    visible: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cutoutImageRef = useRef<HTMLImageElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [prevLoadKey, setPrevLoadKey] = useState<string>(
    `${sourceImageUrl}:${cutoutImageUrl}:${retryKey}`,
  );
  const currentLoadKey = `${sourceImageUrl}:${cutoutImageUrl}:${retryKey}`;

  if (currentLoadKey !== prevLoadKey) {
    setPrevLoadKey(currentLoadKey);
    setLoading(true);
    setLoadError(null);
  }

  useEffect(() => {
    let active = true;

    const loadImage = (url: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        if (!url.startsWith("data:") && !url.startsWith("blob:")) {
          img.crossOrigin = "anonymous";
        }
        img.onload = () => resolve(img);
        img.onerror = () => {
          // If anonymous fails (e.g. CORS cache conflict), retry without crossOrigin
          if (img.crossOrigin) {
            const fallback = new Image();
            fallback.onload = () => resolve(fallback);
            fallback.onerror = () => reject(new Error("Failed to load image"));
            fallback.src = url;
          } else {
            reject(new Error("Failed to load image"));
          }
        };
        img.src = url;
      });
    };

    // Safety timeout: 10s maximum wait
    const timeoutId = setTimeout(() => {
      if (active) {
        setLoadError("Image took too long to load. Please try again.");
        setLoading(false);
      }
    }, 10000);

    Promise.all([loadImage(sourceImageUrl), loadImage(cutoutImageUrl)])
      .then(([srcImg, cutImg]) => {
        if (!active) return;
        clearTimeout(timeoutId);

        try {
          const w = cutImg.naturalWidth || cutImg.width || 800;
          const h = cutImg.naturalHeight || cutImg.height || 800;

          const sCanvas = document.createElement("canvas");
          sCanvas.width = w;
          sCanvas.height = h;
          const sCtx = sCanvas.getContext("2d", { willReadFrequently: true });
          if (!sCtx) throw new Error("Could not create source 2D canvas context.");
          sCtx.drawImage(srcImg, 0, 0, w, h);
          sourceCanvasRef.current = sCanvas;
          cutoutImageRef.current = cutImg;

          const wCanvas = canvasRef.current;
          if (wCanvas) {
            wCanvas.width = w;
            wCanvas.height = h;
            const wCtx = wCanvas.getContext("2d", { willReadFrequently: true });
            if (wCtx) {
              wCtx.clearRect(0, 0, w, h);
              wCtx.drawImage(cutImg, 0, 0, w, h);
            }
          }

          undoStackRef.current = [];
          setCanUndo(false);
          setLoading(false);
        } catch (err) {
          setLoadError(
            err instanceof Error
              ? err.message
              : "Failed to initialize canvas editor.",
          );
          setLoading(false);
        }
      })
      .catch(() => {
        if (!active) return;
        clearTimeout(timeoutId);
        setLoadError("Could not load garment image for touch-up editing.");
        setLoading(false);
      });

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [sourceImageUrl, cutoutImageUrl, retryKey]);

  const getCanvasCoords = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [],
  );

  const paintPoint = useCallback(
    (x: number, y: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const radius = brushSize / 2;

      if (brushMode === "erase") {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        const grad = ctx.createRadialGradient(x, y, radius * 0.4, x, y, radius);
        grad.addColorStop(0, "rgba(0, 0, 0, 1)");
        grad.addColorStop(0.85, "rgba(0, 0, 0, 0.95)");
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        const sCanvas = sourceCanvasRef.current;
        if (!sCanvas) return;
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        const pattern = ctx.createPattern(sCanvas, "no-repeat");
        if (pattern) {
          ctx.fillStyle = pattern;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    },
    [brushMode, brushSize],
  );

  const interpolateAndPaint = useCallback(
    (fromX: number, fromY: number, toX: number, toY: number) => {
      const dx = toX - fromX;
      const dy = toY - fromY;
      const dist = Math.hypot(dx, dy);
      const step = Math.max(2, brushSize * 0.2);
      const numSteps = Math.ceil(dist / step);
      for (let s = 1; s <= numSteps; s++) {
        const t = s / numSteps;
        paintPoint(fromX + dx * t, fromY + dy * t);
      }
    },
    [brushSize, paintPoint],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      undoStackRef.current.push(snap);
      if (undoStackRef.current.length > 20) {
        undoStackRef.current.shift();
      }
      setCanUndo(true);
    }

    const coords = getCanvasCoords(e);
    lastPosRef.current = coords;
    paintPoint(coords.x, coords.y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      setCursorPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        visible: true,
      });
    }

    if (!isDrawingRef.current || !lastPosRef.current) return;
    const coords = getCanvasCoords(e);
    interpolateAndPaint(
      lastPosRef.current.x,
      lastPosRef.current.y,
      coords.x,
      coords.y,
    );
    lastPosRef.current = coords;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = false;
    lastPosRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture already released
    }
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(prev, 0, 0);
    setCanUndo(undoStackRef.current.length > 0);
  };

  const handleReset = () => {
    const canvas = canvasRef.current;
    const cutImg = cutoutImageRef.current;
    if (!canvas || !cutImg) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStackRef.current.push(snap);
    setCanUndo(true);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cutImg, 0, 0, canvas.width, canvas.height);
  };

  const handleApply = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) {
        onApply(blob);
      }
    }, "image/png");
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {/* Top Toolbar: Brush Mode & Size Controls */}
      <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-2 shadow-xs">
        <div
          className="flex items-center gap-1.5"
          role="group"
          aria-label="Brush Mode"
        >
          <button
            type="button"
            onClick={() => setBrushMode("erase")}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              brushMode === "erase"
                ? "bg-red-500/15 font-semibold text-red-600 shadow-xs dark:text-red-400"
                : "text-muted hover:bg-surface-muted hover:text-foreground"
            }`}
          >
            <Eraser className="size-3.5" aria-hidden />
            Erase Unwanted
          </button>
          <button
            type="button"
            onClick={() => setBrushMode("restore")}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              brushMode === "restore"
                ? "bg-emerald-500/15 font-semibold text-emerald-600 shadow-xs dark:text-emerald-400"
                : "text-muted hover:bg-surface-muted hover:text-foreground"
            }`}
          >
            <Paintbrush className="size-3.5" aria-hidden />
            Restore Straps / Lace
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted">Size:</span>
            <input
              type="range"
              min={6}
              max={64}
              step={2}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              aria-label="Brush size"
              className="w-20 accent-foreground sm:w-28"
            />
            <span className="w-8 font-mono text-[11px] text-muted text-right">
              {brushSize}px
            </span>
          </div>

          <div className="flex items-center gap-1 border-l border-border pl-2">
            <button
              type="button"
              disabled={!canUndo}
              onClick={handleUndo}
              aria-label="Undo last brush stroke"
              title="Undo last stroke"
              className="inline-flex size-7 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-30"
            >
              <Undo2 className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={handleReset}
              aria-label="Reset cutout to initial state"
              title="Reset cutout"
              className="inline-flex size-7 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground"
            >
              <RotateCcw className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Center Interactive Working Canvas with Checkerboard Background */}
      <div
        ref={containerRef}
        className="relative flex aspect-square w-full max-w-[26rem] items-center justify-center overflow-hidden rounded-xl border border-border bg-[repeating-conic-gradient(#e5e7eb_0_25%,#ffffff_0_50%)] bg-[size:16px_16px] shadow-sm dark:bg-[repeating-conic-gradient(#27272a_0_25%,#18181b_0_50%)]"
        onPointerLeave={() => setCursorPos((p) => ({ ...p, visible: false }))}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`h-full w-full cursor-none touch-none select-none object-contain ${
            loading || loadError ? "invisible" : ""
          }`}
        />

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/60 text-center backdrop-blur-2xs">
            <Loader2 className="size-6 animate-spin text-accent" aria-hidden />
            <p className="text-xs text-muted">
              Loading cutout for brush touch-up...
            </p>
          </div>
        )}

        {loadError && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-surface/90">
            <AlertTriangle className="mx-auto size-6 text-danger" aria-hidden />
            <p className="mt-1 text-xs text-danger">{loadError}</p>
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              className="mt-2 text-xs font-semibold text-accent underline hover:text-accent-contrast"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !loadError && cursorPos.visible && (
          <div
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[width,height] ${
              brushMode === "erase"
                ? "border-red-500 bg-red-500/20 shadow-xs"
                : "border-emerald-500 bg-emerald-500/20 shadow-xs"
            }`}
            style={{
              left: cursorPos.x,
              top: cursorPos.y,
              width: brushSize,
              height: brushSize,
            }}
          />
        )}
      </div>

      {/* Helpful Hint & Bottom Apply/Cancel Actions */}
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted">
          {brushMode === "erase"
            ? "Erasing: drag over unwanted clips, hangers, or fingers."
            : "Restoring: drag over straps or lace to recover them from original photo."}
        </p>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-xs"
          >
            Back to Comparison
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            className="text-xs"
          >
            <Check className="size-3.5" aria-hidden />
            Apply &amp; Recenter
          </Button>
        </div>
      </div>
    </div>
  );
}

function BeautifyExistingItemModal({
  itemId,
  itemName,
  category,
  originalImagePath,
  initialOriginalUrl,
  initialBeautifiedUrl,
  initialMode,
  initialCompareView,
  inspectExistingOnly = false,
  hasSavedBeautified,
  isShowingBeautified,
  onClose,
  onRestoreOriginal,
  onAccepted,
}: BeautifyExistingItemModalProps) {
  const [mode, setMode] = useState<BeautificationMode>(initialMode);
  const [tolerance, setTolerance] = useState<number>(36);
  const [wrinklePct, setWrinklePct] = useState<number>(68);
  const [addShadow, setAddShadow] = useState<boolean>(true);
  const [compareView, setCompareView] = useState<
    "slider" | "side-by-side" | "refine"
  >(initialCompareView);
  const [sliderPos, setSliderPos] = useState<number>(50);

  const [sourceUrl, setSourceUrl] = useState<string | null>(
    initialOriginalUrl ?? null,
  );
  const [editedSourceBlob, setEditedSourceBlob] = useState<Blob | null>(null);
  const editedSourceDataUrlRef = useRef<string | null>(null);
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    inspectExistingOnly && initialBeautifiedUrl ? initialBeautifiedUrl : null,
  );
  const [workingCutoutUrl, setWorkingCutoutUrl] = useState<string | null>(null);
  const customCutoutUrlRef = useRef<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [diagnostics, setDiagnostics] =
    useState<BeautifyQualityDiagnostics | null>(null);
  const [status, setStatus] = useState<
    "loading-source" | "processing" | "ready" | "error" | "saving"
  >(
    inspectExistingOnly && initialBeautifiedUrl ? "ready" : "loading-source",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isBusy =
    status === "loading-source" ||
    status === "processing" ||
    status === "saving";

  const cachedPhotoRoomCutoutRef = useRef<string | null>(null);
  const cachedCatalogFlatLayRef = useRef<string | null>(null);
  const cachedAiParamsRef = useRef<AiEnhancementParams | null>(null);
  const renderedCacheRef = useRef<Map<string, CachedPreviewEntry>>(new Map());
  const [providerUsed, setProviderUsed] = useState<string>("photoroom");
  const [modelUsed, setModelUsed] = useState<string>("photoroom-v2-edit");
  const jobCounterRef = useRef(0);

  useEffect(() => {
    const cache = renderedCacheRef.current;
    return () => {
      for (const entry of cache.values()) {
        URL.revokeObjectURL(entry.url);
      }
      cache.clear();
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "saving") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, status]);

  const runPipeline = useCallback(
    async (
      targetMode: BeautificationMode,
      targetTolerance: number,
      targetShadow: boolean,
      forceReprocess = false,
      targetWrinklePct = wrinklePct,
    ) => {
      const cacheKey = `${targetMode}:${targetTolerance}:${targetShadow ? 1 : 0}:${targetMode === "ai-enhance" ? targetWrinklePct : 0}`;
      if (!forceReprocess) {
        const cached = renderedCacheRef.current.get(cacheKey);
        if (cached) {
          setPreviewBlob(cached.blob);
          setPreviewUrl(cached.url);
          setDiagnostics(cached.diagnostics);
          setProviderUsed(cached.provider);
          setModelUsed(cached.model);
          setStatus("ready");
          setErrorMessage(null);
          return;
        }
      }

      const jobId = ++jobCounterRef.current;
      setStatus("processing");
      setErrorMessage(null);

      try {
        // 1. Ensure we have a fresh full-resolution signed URL for the original image
        let workingSourceUrl = sourceUrl;
        if (!workingSourceUrl) {
          const freshUrls = await getItemBeautifyUrlsAction(itemId);
          if (freshUrls.ok && freshUrls.originalUrl) {
            workingSourceUrl = freshUrls.originalUrl;
            setSourceUrl(freshUrls.originalUrl);
          }
        }

        if (!workingSourceUrl) {
          throw new Error(
            "Original garment image is unavailable. Please try again.",
          );
        }

        // 2. Call /api/ai/beautify to obtain neural background cutout or generative catalog flat-lay (cached per item)
        // and, when Mode 2 (ai-enhance) is requested, Gemini wrinkle/lighting calibration.
        const isFlatLayMode = targetMode === "catalog-flatlay";
        const needCutout = isFlatLayMode
          ? !cachedCatalogFlatLayRef.current || forceReprocess
          : !cachedPhotoRoomCutoutRef.current || forceReprocess;
        const needAiParams =
          targetMode === "ai-enhance" &&
          (!cachedAiParamsRef.current || forceReprocess);

        let currentProvider = isFlatLayMode
          ? cachedCatalogFlatLayRef.current
            ? "mistral-flux"
            : "local-studio"
          : cachedPhotoRoomCutoutRef.current
            ? "removebg"
            : "local-studio";
        let currentModel = isFlatLayMode
          ? cachedCatalogFlatLayRef.current
            ? "mistral-medium-2505+flux-1.1-pro-ultra"
            : "closetai-cv-v2"
          : cachedPhotoRoomCutoutRef.current
            ? "remove-bg-v1"
            : "closetai-cv-v2";

        if (needCutout || needAiParams) {
          try {
            const requestPayload: Record<string, unknown> = {
              mode: targetMode,
              skipSegmentation: isFlatLayMode ? false : !needCutout,
            };
            if (editedSourceDataUrlRef.current) {
              requestPayload.imageDataUrl = editedSourceDataUrlRef.current;
            } else {
              requestPayload.path = originalImagePath;
            }

            const res = await fetch("/api/ai/beautify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestPayload),
            });
            if (res.ok) {
              const body = (await res.json()) as {
                status?: string;
                provider?: string;
                model?: string;
                cutoutDataUrl?: string | null;
                params?: AiEnhancementParams;
                reason?: string | null;
              };
              if (body.cutoutDataUrl) {
                if (isFlatLayMode) {
                  cachedCatalogFlatLayRef.current = body.cutoutDataUrl;
                } else {
                  cachedPhotoRoomCutoutRef.current = body.cutoutDataUrl;
                }
              }
              if (body.provider) {
                currentProvider = body.provider;
              }
              if (body.model) {
                currentModel = body.model;
              }
              if (body.params && targetMode === "ai-enhance") {
                cachedAiParamsRef.current = {
                  ...body.params,
                  qualityNote:
                    body.reason ?? body.params.qualityNote ?? null,
                };
              }
            }
          } catch {
            // If server request fails, falls back gracefully to local CV segmentation
          }
        }

        const userWrinkleSoftening = Math.max(
          0.25,
          Math.min(0.85, targetWrinklePct / 100),
        );
        const aiParams: AiEnhancementParams | null =
          targetMode === "ai-enhance"
            ? {
                ...(cachedAiParamsRef.current ?? {}),
                wrinkleSoftening: userWrinkleSoftening,
                shadowLift: Math.max(
                  cachedAiParamsRef.current?.shadowLift ?? 0.42,
                  userWrinkleSoftening * 0.68,
                ),
              }
            : null;
        const activeCutout = isFlatLayMode
          ? (cachedCatalogFlatLayRef.current ?? cachedPhotoRoomCutoutRef.current)
          : cachedPhotoRoomCutoutRef.current;
        const inputForStandardizer =
          customCutoutUrlRef.current ??
          activeCutout ??
          workingSourceUrl;

        const result = await beautifyGarmentImage(inputForStandardizer, {
          mode: targetMode,
          category,
          tolerance: targetTolerance,
          addShadow: targetShadow,
          background: "clean-white",
          targetCanvasSize: 1024,
          aiParams,
        });

        if (jobId !== jobCounterRef.current) return;

        const nextUrl = URL.createObjectURL(result.blob);
        const prevCached = renderedCacheRef.current.get(cacheKey);
        if (prevCached) {
          URL.revokeObjectURL(prevCached.url);
        }
        renderedCacheRef.current.set(cacheKey, {
          blob: result.blob,
          url: nextUrl,
          diagnostics: result.diagnostics,
          provider: currentProvider,
          model: currentModel,
        });

        setProviderUsed(currentProvider);
        setModelUsed(currentModel);
        setPreviewBlob(result.blob);
        setPreviewUrl(nextUrl);
        setDiagnostics(result.diagnostics);
        setStatus("ready");
      } catch (err) {
        if (jobId !== jobCounterRef.current) return;
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Could not beautify this photo. Try adjusting the edge sensitivity or using a clearer background.",
        );
      }
    },
    [itemId, originalImagePath, category, sourceUrl, wrinklePct],
  );

  useEffect(() => {
    if (inspectExistingOnly && initialBeautifiedUrl) {
      return;
    }
    const timer = setTimeout(() => {
      void runPipeline(mode, tolerance, addShadow, false, wrinklePct);
    }, 0);
    return () => clearTimeout(timer);
    // Only auto-run on initial mount; user changes trigger via controls
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleModeSwitch(nextMode: BeautificationMode) {
    if (status === "processing" || status === "saving") {
      return;
    }
    setMode(nextMode);
    await runPipeline(nextMode, tolerance, addShadow, false, wrinklePct);
  }

  async function openRefineView() {
    if (workingCutoutUrl || customCutoutUrlRef.current) {
      setCompareView("refine");
      return;
    }
    if (cachedPhotoRoomCutoutRef.current) {
      setWorkingCutoutUrl(cachedPhotoRoomCutoutRef.current);
      setCompareView("refine");
      return;
    }
    if (!sourceUrl) {
      setCompareView("refine");
      return;
    }
    setStatus("processing");
    try {
      const res = await beautifyGarmentImage(sourceUrl, {
        mode,
        category,
        tolerance,
        addShadow: false,
        background: "transparent",
        targetCanvasSize: 1024,
      });
      const url = URL.createObjectURL(res.blob);
      setWorkingCutoutUrl(url);
      setStatus("ready");
      setCompareView("refine");
    } catch (err) {
      setStatus("ready");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Could not prepare transparent cutout for touch-up.",
      );
    }
  }

  const handleApplyTransformedImage = useCallback(
    async (result: TransformedImageResult) => {
      setEditedSourceBlob(result.blob);
      setSourceUrl(result.url);

      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(result.blob);
        });
        editedSourceDataUrlRef.current = dataUrl;
      } catch {
        // Fallback: local CV can use sourceUrl
      }

      cachedPhotoRoomCutoutRef.current = null;
      cachedCatalogFlatLayRef.current = null;
      cachedAiParamsRef.current = null;
      customCutoutUrlRef.current = null;
      renderedCacheRef.current.clear();

      void runPipeline(mode, tolerance, addShadow, true, wrinklePct);
    },
    [mode, tolerance, addShadow, wrinklePct, runPipeline],
  );

  const handleQuickRotate = useCallback(
    async (degrees: 90 | -90) => {
      if (!sourceUrl || isBusy) return;
      try {
        const res = await rotateImage(sourceUrl, degrees);
        await handleApplyTransformedImage(res);
      } catch (err) {
        console.error("Quick rotate failed:", err);
      }
    },
    [sourceUrl, isBusy, handleApplyTransformedImage],
  );

  const handleRevertOrientation = useCallback(() => {
    if (!initialOriginalUrl) return;
    setEditedSourceBlob(null);
    editedSourceDataUrlRef.current = null;
    setSourceUrl(initialOriginalUrl);
    cachedPhotoRoomCutoutRef.current = null;
    cachedCatalogFlatLayRef.current = null;
    cachedAiParamsRef.current = null;
    customCutoutUrlRef.current = null;
    renderedCacheRef.current.clear();
    void runPipeline(mode, tolerance, addShadow, true, wrinklePct);
  }, [initialOriginalUrl, mode, tolerance, addShadow, wrinklePct, runPipeline]);

  async function handleAccept() {
    if (!previewBlob || status === "saving" || status === "processing") return;
    setStatus("saving");
    setErrorMessage(null);

    try {
      const controller = new AbortController();

      let updatedOriginalPath: string | undefined;
      if (editedSourceBlob) {
        updatedOriginalPath = await uploadPhoto(editedSourceBlob, {
          signal: controller.signal,
          onProgress: () => {},
        });
      }

      const uploadedPath = await uploadPhoto(previewBlob, {
        signal: controller.signal,
        onProgress: () => {},
      });

      const saved = await saveBeautifiedImageAction(itemId, {
        beautifiedPath: uploadedPath,
        originalPath: updatedOriginalPath,
        mode,
        provider: providerUsed,
        model: modelUsed,
      });

      if (!saved.ok) {
        setStatus("ready");
        setErrorMessage(saved.error);
        return;
      }

      onAccepted({
        activeImagePath: saved.activeImagePath,
        activeImageUrl: saved.activeImageUrl,
        originalImageUrl: saved.originalImageUrl,
        beautifiedImageUrl: saved.beautifiedImageUrl,
        beautificationMode: saved.beautificationMode,
      });
    } catch (err) {
      setStatus("ready");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to save beautified image. Please try again.",
      );
    }
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 md:p-6 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="beautify-modal-title"
    >
      <div className="flex max-h-[96vh] sm:max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl sm:rounded-3xl border border-border bg-surface shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 shrink-0 text-accent" aria-hidden />
              <h2
                id="beautify-modal-title"
                className="font-display text-base sm:text-xl font-medium truncate"
              >
                Product Studio &mdash; Garment Beautification
              </h2>
            </div>
            <p className="mt-0.5 text-[11px] sm:text-xs text-muted truncate">
              {itemName} &middot; Standardized for {categoryLabel(category)}{" "}
              (1024&times;1024 #FFFFFF studio canvas, original preserved)
            </p>
          </div>
          <button
            type="button"
            disabled={status === "saving"}
            onClick={onClose}
            aria-label="Close Product Studio dialog"
            className="inline-flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 gap-4 sm:gap-6 overflow-y-auto p-3 sm:p-5 lg:p-6 lg:grid-cols-[1fr_20.5rem]">
          {/* Left: Comparison Stage */}
          <div className="flex flex-col gap-3 min-w-0">
            {/* Primary Mode Switcher (Always visible above canvas) */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface-muted/90 p-1.5">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleModeSwitch("clean-cutout")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  mode === "clean-cutout"
                    ? "bg-surface text-foreground shadow-xs font-semibold"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Wand2 className="size-3.5 text-accent" aria-hidden />
                1. Clean Cutout
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleModeSwitch("ai-enhance")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  mode === "ai-enhance"
                    ? "bg-surface text-foreground shadow-xs font-semibold"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Sparkles className="size-3.5 text-accent" aria-hidden />
                2. AI Enhance
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleModeSwitch("catalog-flatlay")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  mode === "catalog-flatlay"
                    ? "bg-accent text-white shadow-xs font-semibold ring-1 ring-accent"
                    : "bg-accent/15 text-foreground hover:bg-accent/25"
                }`}
              >
                <Sparkles className="size-3.5" aria-hidden />
                ✨ 4. AI Catalog Flat-Lay (ChatGPT-Style)
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex rounded-xl border border-border bg-surface-muted p-1"
                  role="group"
                  aria-label="Compare Original and Processed"
                >
                  <button
                    type="button"
                    onClick={() => setCompareView("slider")}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2 sm:px-3 py-1 text-xs font-medium transition ${
                      compareView === "slider"
                        ? "bg-surface text-foreground shadow-xs"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">Compare: </span>Slider
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareView("side-by-side")}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2 sm:px-3 py-1 text-xs font-medium transition ${
                      compareView === "side-by-side"
                        ? "bg-surface text-foreground shadow-xs"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    <Columns2 className="size-3.5 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">Compare: </span>Side-by-Side
                  </button>
                  <button
                    type="button"
                    onClick={() => void openRefineView()}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2 sm:px-3 py-1 text-xs font-medium transition ${
                      compareView === "refine"
                        ? "bg-surface text-foreground shadow-xs"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    <Paintbrush className="size-3.5 shrink-0" aria-hidden />
                    Touch-Up<span className="hidden sm:inline"> Brush</span>
                  </button>
                </div>

                {/* Quick Rotate & Interactive Crop Controls */}
                <div
                  className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-muted p-1"
                  role="group"
                  aria-label="Image Orientation and Cropping"
                >
                  <button
                    type="button"
                    disabled={isBusy || !sourceUrl}
                    onClick={() => void handleQuickRotate(-90)}
                    title="Rotate 90° counter-clockwise"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface hover:text-foreground transition disabled:opacity-40"
                  >
                    <RotateCcw className="size-3.5 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">Rotate </span>-90°
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || !sourceUrl}
                    onClick={() => void handleQuickRotate(90)}
                    title="Rotate 90° clockwise"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface hover:text-foreground transition disabled:opacity-40"
                  >
                    <RotateCw className="size-3.5 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">Rotate </span>+90°
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || !sourceUrl}
                    onClick={() => setIsCropperOpen(true)}
                    title="Rotate & Crop bounds"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface hover:text-foreground transition disabled:opacity-40"
                  >
                    <Crop className="size-3.5 shrink-0 text-accent" aria-hidden />
                    <span>Rotate &amp; Crop</span>
                  </button>
                </div>

                {editedSourceBlob && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleRevertOrientation}
                    className="text-[11px] text-accent hover:underline font-medium px-1"
                  >
                    Revert Orientation
                  </button>
                )}
              </div>

              {status === "ready" && (
                <span className="text-[11px] sm:text-xs text-muted truncate">
                  {providerUsed.includes("flux")
                    ? "FLUX 1.1 Pro Flat-Lay"
                    : providerUsed.includes("removebg")
                      ? "Remove.bg Neural Cutout"
                      : providerUsed.includes("photoroom")
                        ? "PhotoRoom Neural Cutout"
                        : providerUsed.includes("clearbackdrop")
                          ? "ClearBackdrop Neural Cutout"
                          : providerUsed.includes("clipdrop")
                            ? "ClipDrop Neural Cutout"
                            : "Studio Cutout"}{" "}
                  &middot;{" "}
                  {mode === "catalog-flatlay"
                    ? "AI Catalog Flat-Lay (#FFFFFF)"
                    : mode === "ai-enhance"
                      ? "AI Enhance (Wrinkle & Lighting)"
                      : "Clean Cutout (#FFFFFF)"}
                </span>
              )}
            </div>

            {/* Canvas Comparison Area */}
            <div className="relative flex min-h-[16rem] sm:min-h-[20rem] lg:min-h-[22rem] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-muted/60 p-2 sm:p-4">
              {status === "processing" || status === "loading-source" ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <Loader2
                    className="size-8 animate-spin text-accent"
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {mode === "catalog-flatlay"
                        ? "Generating AI Catalog Flat-Lay (erasing human limbs & inpainting insoles)..."
                        : mode === "ai-enhance"
                          ? "Reducing fabric wrinkles & balancing studio lighting (protecting logos & text)..."
                          : "Removing background & centering on 1024×1024 #FFFFFF studio canvas..."}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Your original photo will never be overwritten.
                    </p>
                  </div>
                </div>
              ) : status === "error" ? (
                <div className="max-w-md space-y-3 text-center">
                  <AlertTriangle
                    className="mx-auto size-8 text-danger"
                    aria-hidden
                  />
                  <p className="text-sm font-medium text-foreground">
                    {errorMessage ?? "Could not process this image."}
                  </p>
                  <div className="flex justify-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        runPipeline("clean-cutout", tolerance, addShadow, true)
                      }
                    >
                      <RefreshCw className="size-3.5" aria-hidden />
                      Retry Clean Cutout
                    </Button>
                  </div>
                </div>
              ) : compareView === "refine" ? (
                <TouchUpCanvasEditor
                  sourceImageUrl={sourceUrl ?? ""}
                  cutoutImageUrl={
                    workingCutoutUrl ?? previewUrl ?? sourceUrl ?? ""
                  }
                  onApply={async (refinedBlob) => {
                    const url = URL.createObjectURL(refinedBlob);
                    customCutoutUrlRef.current = url;
                    setWorkingCutoutUrl(url);
                    setCompareView("slider");
                    await runPipeline(mode, tolerance, addShadow, true);
                  }}
                  onCancel={() => setCompareView("slider")}
                />
              ) : compareView === "side-by-side" ? (
                <div className="grid w-full gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <span className="block text-center text-xs font-medium text-muted">
                      Original Upload
                    </span>
                    <div className="aspect-square overflow-hidden rounded-xl border border-border bg-surface">
                      {sourceUrl && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={sourceUrl}
                          alt="Original garment"
                          className="h-full w-full object-contain"
                        />
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="block text-center text-xs font-medium text-foreground">
                      Processed (
                      {mode === "catalog-flatlay"
                        ? "AI Flat-Lay"
                        : mode === "ai-enhance"
                          ? "AI Enhance"
                          : "Clean Cutout"}
                      )
                    </span>
                    <div className="aspect-square overflow-hidden rounded-xl border border-border bg-white">
                      {previewUrl && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={previewUrl}
                          alt="Beautified garment preview"
                          className="h-full w-full object-contain"
                        />
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Interactive Before / After Split Slider */
                <div className="relative aspect-square w-full max-w-[18rem] sm:max-w-[22rem] md:max-w-[26rem] select-none overflow-hidden rounded-xl border border-border bg-white shadow-sm">
                  {previewUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={previewUrl}
                      alt="Beautified garment"
                      className="h-full w-full object-contain"
                    />
                  )}
                  {sourceUrl && (
                    <div
                      className="absolute inset-0 overflow-hidden bg-surface"
                      style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sourceUrl}
                        alt="Original garment"
                        className="h-full w-full object-contain"
                      />
                    </div>
                  )}
                  <div
                    className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground/80 shadow"
                    style={{ left: `${sliderPos}%` }}
                  >
                    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 top-1/2 flex size-7 items-center justify-center rounded-full border border-border bg-surface text-[10px] font-bold text-foreground shadow">
                      &harr;
                    </div>
                  </div>
                  <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
                    Original
                  </span>
                  <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-md bg-accent/90 px-2 py-0.5 text-[11px] font-medium text-white">
                    {mode === "catalog-flatlay"
                      ? "AI Flat-Lay"
                      : mode === "ai-enhance"
                        ? "AI Enhanced"
                        : "Clean Cutout"}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={sliderPos}
                    onChange={(e) => setSliderPos(Number(e.target.value))}
                    aria-label="Before and after comparison slider"
                    className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
                  />
                </div>
              )}
            </div>

            {/* Quality Diagnostics & Warnings */}
            {diagnostics && diagnostics.warnings.length > 0 && (
              <div className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground">
                {diagnostics.warnings.map((warning, i) => (
                  <p key={i} className="flex items-start gap-2">
                    <AlertTriangle
                      className="mt-0.5 size-3.5 shrink-0 text-amber-600"
                      aria-hidden
                    />
                    <span>{warning}</span>
                  </p>
                ))}
              </div>
            )}

            {errorMessage && status !== "error" && (
              <p
                role="alert"
                className="rounded-xl bg-danger-soft p-3 text-xs text-danger"
              >
                {errorMessage}
              </p>
            )}
          </div>

          {/* Right: Three Product Studio Operations & Controls */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-surface-muted/40 p-3 sm:p-4 overflow-y-auto max-h-[75vh] lg:max-h-[calc(92vh-90px)]">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Product Studio Operations
                </p>
                <div className="mt-2 space-y-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleModeSwitch("clean-cutout")}
                    className={`w-full rounded-xl border p-2.5 text-left transition ${
                      mode === "clean-cutout"
                        ? "border-foreground bg-surface shadow-xs"
                        : "border-border bg-surface/60 hover:border-foreground/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Wand2 className="size-3.5 text-accent" aria-hidden />
                        1. Clean Cutout
                      </span>
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-muted">
                        Standard
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted leading-relaxed">
                      Removes background via ClearBackdrop / Remove BG, centered on pure white (#FFFFFF). 100% faithful original pixels.
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleModeSwitch("ai-enhance")}
                    className={`w-full rounded-xl border p-2.5 text-left transition ${
                      mode === "ai-enhance"
                        ? "border-foreground bg-surface shadow-xs"
                        : "border-border bg-surface/60 hover:border-foreground/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Sparkles
                          className="size-3.5 text-accent"
                          aria-hidden
                        />
                        2. AI Enhance
                      </span>
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                        Wrinkle &amp; Light
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted leading-relaxed">
                      Smooths wrinkles &amp; lifts shadows while strictly protecting logos, text, patterns, and seams.
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      if (compareView !== "refine") {
                        void openRefineView();
                      }
                    }}
                    className={`w-full rounded-xl border p-2.5 text-left transition ${
                      compareView === "refine"
                        ? "border-foreground bg-surface shadow-xs"
                        : "border-border bg-surface/60 hover:border-foreground/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Paintbrush
                          className="size-3.5 text-accent"
                          aria-hidden
                        />
                        3. Touch-Up Masking Brush
                      </span>
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                        Precision
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted leading-relaxed">
                      Erase lingering hanger hooks, clips, or thumbs. Restore clipped spaghetti straps directly.
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleModeSwitch("catalog-flatlay")}
                    className={`w-full rounded-xl border p-2.5 text-left transition ${
                      mode === "catalog-flatlay"
                        ? "border-accent bg-accent/5 ring-1 ring-accent shadow-xs"
                        : "border-border bg-surface/60 hover:border-foreground/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Sparkles
                          className="size-3.5 text-accent"
                          aria-hidden
                        />
                        ✨ 4. AI Catalog Flat-Lay
                      </span>
                      <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">
                        Limb Removal
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted leading-relaxed">
                      ChatGPT-style inpainting: erases feet, socks &amp; hands; inpaints clean insoles/collars on studio white.
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      setCompareView((prev) =>
                        prev === "slider"
                          ? "side-by-side"
                          : prev === "side-by-side"
                            ? "refine"
                            : "slider",
                      )
                    }
                    className="w-full rounded-xl border border-border bg-surface/60 p-2 text-left transition hover:border-foreground/40"
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Columns2
                          className="size-3.5 text-accent"
                          aria-hidden
                        />
                        5. Compare (
                        {compareView === "slider"
                          ? "Split Slider"
                          : compareView === "side-by-side"
                            ? "Side-by-Side"
                            : "Touch-Up"}
                        )
                      </span>
                      <span className="text-[10px] font-medium text-muted">
                        Switch View
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Wrinkle Reduction, Segmentation Sensitivity & Contact Shadow */}
              <div className="space-y-3 border-t border-border pt-4">
                {mode === "ai-enhance" && (
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <label
                        htmlFor="beautify-wrinkle-pct"
                        className="font-medium text-foreground"
                      >
                        Wrinkle &amp; Fold Smoothing
                      </label>
                      <span className="text-muted">{wrinklePct}%</span>
                    </div>
                    <input
                      id="beautify-wrinkle-pct"
                      type="range"
                      min={30}
                      max={85}
                      value={wrinklePct}
                      disabled={isBusy}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setWrinklePct(next);
                      }}
                      onMouseUp={() =>
                        void runPipeline(
                          mode,
                          tolerance,
                          addShadow,
                          false,
                          wrinklePct,
                        )
                      }
                      onTouchEnd={() =>
                        void runPipeline(
                          mode,
                          tolerance,
                          addShadow,
                          false,
                          wrinklePct,
                        )
                      }
                      className="mt-1.5 w-full accent-foreground"
                    />
                    <p className="mt-0.5 text-[11px] text-muted">
                      Flattens sleeve &amp; torso creases while locking printed
                      graphics and text at 100% sharpness.
                    </p>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between text-xs">
                    <label
                      htmlFor="beautify-tolerance"
                      className="font-medium text-foreground"
                    >
                      Background Sensitivity
                    </label>
                    <span className="text-muted">{tolerance}</span>
                  </div>
                  <input
                    id="beautify-tolerance"
                    type="range"
                    min={18}
                    max={62}
                    value={tolerance}
                    disabled={isBusy}
                    onChange={(e) => setTolerance(Number(e.target.value))}
                    className="mt-1.5 w-full accent-foreground"
                  />
                  <p className="mt-0.5 text-[11px] text-muted">
                    Lower for white-on-white or dark-on-dark items; raise for
                    textured backgrounds.
                  </p>
                </div>

                <label className="flex cursor-pointer items-center justify-between text-xs font-medium text-foreground">
                  <span>Subtle grounded contact shadow</span>
                  <input
                    type="checkbox"
                    checked={addShadow}
                    disabled={isBusy}
                    onChange={(e) => setAddShadow(e.target.checked)}
                    className="size-4 rounded border-border accent-foreground"
                  />
                </label>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy}
                  onClick={() =>
                    runPipeline(mode, tolerance, addShadow, true, wrinklePct)
                  }
                  className="w-full text-xs"
                >
                  <RefreshCw className="size-3.5" aria-hidden />
                  Retry Enhancement
                </Button>
              </div>
            </div>

            {/* Footer Actions: Accept, Reject, Restore Original (Sticky at bottom of sidebar) */}
            <div className="sticky bottom-0 -mx-3 sm:-mx-4 -mb-3 sm:-mb-4 px-3 sm:px-4 py-3 bg-surface/95 border-t border-border backdrop-blur-xs shadow-md space-y-2">
              <Button
                type="button"
                disabled={isBusy || status !== "ready" || !previewBlob}
                loading={status === "saving"}
                onClick={handleAccept}
                className="w-full"
              >
                <Check className="size-4" aria-hidden />
                Accept &amp; Save Result
              </Button>

              {hasSavedBeautified && isShowingBeautified && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => void onRestoreOriginal()}
                  className="w-full text-xs"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  Restore Original Image
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={status === "saving"}
                onClick={onClose}
                className="w-full text-xs"
              >
                Reject &amp; Keep Current
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderedOutput = (
    <>
      {modalContent}
      {isCropperOpen && sourceUrl && (
        <ImageCropperModal
          isOpen={isCropperOpen}
          imageUrl={sourceUrl}
          onClose={() => setIsCropperOpen(false)}
          onApply={(res) => {
            void handleApplyTransformedImage(res);
          }}
          title="Rotate & Crop Garment"
        />
      )}
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(renderedOutput, document.body);
}
