"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Columns2,
  Eraser,
  Loader2,
  Paintbrush,
  RefreshCw,
  RotateCcw,
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
import { ItemImage } from "@/components/wardrobe/item-image";
import type {
  AiEnhancementParams,
  BeautificationMode,
  BeautifyQualityDiagnostics,
} from "@/lib/wardrobe/beautify-engine";
import { categoryLabel } from "@/lib/wardrobe/categories";
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
            {modeUsed === "ai-enhance" ? "AI Enhanced" : "Clean Cutout"}
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
          <strong>Privacy notice:</strong> Running Clean Cutout or AI Enhance sends this garment
          photo to <strong>PhotoRoom</strong> (and Google Gemini for AI Enhance lighting/wrinkle
          calibration). Your original photo is preserved.
        </p>

        <div
          className="mt-3 grid grid-cols-3 gap-1.5"
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
            className="px-2 text-xs"
          >
            <Wand2 className="size-3.5 text-accent" aria-hidden />
            Clean Cutout
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
            className="px-2 text-xs"
          >
            <Sparkles className="size-3.5 text-accent" aria-hidden />
            AI Enhance
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
            className="px-2 text-xs"
          >
            <Columns2 className="size-3.5 text-accent" aria-hidden />
            Compare
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

  useEffect(() => {
    let active = true;

    const srcImg = new Image();
    srcImg.crossOrigin = "anonymous";

    const cutImg = new Image();
    cutImg.crossOrigin = "anonymous";

    let loadedCount = 0;
    const onBothLoaded = () => {
      if (!active) return;
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
        if (!wCanvas) return;
        wCanvas.width = w;
        wCanvas.height = h;
        const wCtx = wCanvas.getContext("2d", { willReadFrequently: true });
        if (!wCtx)
          throw new Error("Could not create working 2D canvas context.");
        wCtx.clearRect(0, 0, w, h);
        wCtx.drawImage(cutImg, 0, 0, w, h);

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
    };

    const onError = () => {
      if (!active) return;
      setLoadError("Could not load garment image for touch-up editing.");
      setLoading(false);
    };

    srcImg.onload = () => {
      loadedCount++;
      if (loadedCount === 2) onBothLoaded();
    };
    srcImg.onerror = onError;

    cutImg.onload = () => {
      loadedCount++;
      if (loadedCount === 2) onBothLoaded();
    };
    cutImg.onerror = onError;

    srcImg.src = sourceImageUrl;
    cutImg.src = cutoutImageUrl;

    return () => {
      active = false;
    };
  }, [sourceImageUrl, cutoutImageUrl]);

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
        {loading ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <Loader2 className="size-6 animate-spin text-accent" aria-hidden />
            <p className="text-xs text-muted">
              Loading cutout for brush touch-up...
            </p>
          </div>
        ) : loadError ? (
          <div className="p-4 text-center">
            <AlertTriangle className="mx-auto size-6 text-danger" aria-hidden />
            <p className="mt-1 text-xs text-danger">{loadError}</p>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="h-full w-full cursor-none touch-none select-none object-contain"
            />
            {cursorPos.visible && (
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
          </>
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

  const cachedPhotoRoomCutoutRef = useRef<string | null>(null);
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

        // 2. Call /api/ai/beautify to obtain PhotoRoom neural background cutout (cached per item)
        // and, when Mode 2 (ai-enhance) is requested, Gemini wrinkle/lighting calibration.
        const needCutout = !cachedPhotoRoomCutoutRef.current || forceReprocess;
        const needAiParams =
          targetMode === "ai-enhance" &&
          (!cachedAiParamsRef.current || forceReprocess);

        let currentProvider = cachedPhotoRoomCutoutRef.current
          ? "photoroom"
          : "local-studio";
        let currentModel = cachedPhotoRoomCutoutRef.current
          ? "photoroom-v2-edit"
          : "closetai-cv-v2";

        if (needCutout || needAiParams) {
          try {
            const res = await fetch("/api/ai/beautify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                path: originalImagePath,
                mode: targetMode,
                skipSegmentation: !needCutout,
              }),
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
                cachedPhotoRoomCutoutRef.current = body.cutoutDataUrl;
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
        const inputForStandardizer =
          customCutoutUrlRef.current ??
          cachedPhotoRoomCutoutRef.current ??
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

  async function handleAccept() {
    if (!previewBlob || status === "saving" || status === "processing") return;
    setStatus("saving");
    setErrorMessage(null);

    try {
      const controller = new AbortController();
      const uploadedPath = await uploadPhoto(previewBlob, {
        signal: controller.signal,
        onProgress: () => {},
      });

      const saved = await saveBeautifiedImageAction(itemId, {
        beautifiedPath: uploadedPath,
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

  const isBusy =
    status === "loading-source" ||
    status === "processing" ||
    status === "saving";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="beautify-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-accent" aria-hidden />
              <h2
                id="beautify-modal-title"
                className="font-display text-xl font-medium"
              >
                Product Studio &mdash; Garment Beautification
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {itemName} &middot; Standardized for {categoryLabel(category)}{" "}
              (1024&times;1024 #FFFFFF studio canvas, original preserved)
            </p>
          </div>
          <button
            type="button"
            disabled={status === "saving"}
            onClick={onClose}
            aria-label="Close Product Studio dialog"
            className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[1fr_20rem]">
          {/* Left: Comparison Stage */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                className="inline-flex rounded-xl border border-border bg-surface-muted p-1"
                role="group"
                aria-label="Compare Original and Processed"
              >
                <button
                  type="button"
                  onClick={() => setCompareView("slider")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition ${
                    compareView === "slider"
                      ? "bg-surface text-foreground shadow-xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <SlidersHorizontal className="size-3.5" aria-hidden />
                  Compare: Before / After Slider
                </button>
                <button
                  type="button"
                  onClick={() => setCompareView("side-by-side")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition ${
                    compareView === "side-by-side"
                      ? "bg-surface text-foreground shadow-xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Columns2 className="size-3.5" aria-hidden />
                  Compare: Side-by-Side
                </button>
                <button
                  type="button"
                  onClick={() => void openRefineView()}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition ${
                    compareView === "refine"
                      ? "bg-surface text-foreground shadow-xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Paintbrush className="size-3.5" aria-hidden />
                  Touch-Up Brush
                </button>
              </div>

              {status === "ready" && (
                <span className="text-xs text-muted">
                  {providerUsed.includes("photoroom")
                    ? "PhotoRoom Neural Cutout"
                    : "Studio Cutout"}{" "}
                  &middot;{" "}
                  {mode === "ai-enhance"
                    ? "AI Enhance (Wrinkle & Lighting)"
                    : "Clean Cutout (#FFFFFF)"}
                </span>
              )}
            </div>

            {/* Canvas Comparison Area */}
            <div className="relative flex min-h-[22rem] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-muted/60 p-4">
              {status === "processing" || status === "loading-source" ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <Loader2
                    className="size-8 animate-spin text-accent"
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {mode === "ai-enhance"
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
                      {mode === "ai-enhance" ? "AI Enhance" : "Clean Cutout"})
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
                <div className="relative aspect-square w-full max-w-[26rem] select-none overflow-hidden rounded-xl border border-border bg-white shadow-sm">
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
                    {mode === "ai-enhance" ? "AI Enhanced" : "Clean Cutout"}
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
          <div className="flex flex-col justify-between gap-5 rounded-2xl border border-border bg-surface-muted/40 p-4">
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Product Studio Operations
                </p>
                <div className="mt-2 space-y-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleModeSwitch("clean-cutout")}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      mode === "clean-cutout"
                        ? "border-foreground bg-surface shadow-xs"
                        : "border-border bg-surface/60 hover:border-foreground/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Wand2 className="size-3.5 text-accent" aria-hidden />
                        1. Clean Cutout
                      </span>
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-muted">
                        Standard
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Removes background via PhotoRoom, crops margins, centers
                      &amp; scales on pure white (#FFFFFF). Preserves 100%
                      original garment pixels.
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleModeSwitch("ai-enhance")}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      mode === "ai-enhance"
                        ? "border-foreground bg-surface shadow-xs"
                        : "border-border bg-surface/60 hover:border-foreground/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
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
                    <p className="mt-1 text-xs text-muted">
                      Reduces fabric wrinkles and lifts harsh shadows while
                      strictly protecting logos, text, patterns, seams, and
                      garment proportions.
                    </p>
                    <p className="mt-1.5 rounded-lg bg-surface-muted/80 px-2 py-1 text-[11px] text-muted">
                      Uses <strong>PhotoRoom</strong> segmentation &amp;{" "}
                      <strong>Google Gemini</strong> lighting calibration.
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
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      compareView === "refine"
                        ? "border-foreground bg-surface shadow-xs"
                        : "border-border bg-surface/60 hover:border-foreground/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
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
                    <p className="mt-1 text-xs text-muted">
                      Erase lingering hanger hooks, clips, or thumbs. Restore
                      clipped spaghetti straps and delicate lace directly from
                      the original photo.
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
                    className="w-full rounded-xl border border-border bg-surface/60 p-2.5 text-left transition hover:border-foreground/40"
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Columns2
                          className="size-3.5 text-accent"
                          aria-hidden
                        />
                        4. Compare (
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

            {/* Footer Actions: Accept, Reject, Restore Original */}
            <div className="space-y-2 border-t border-border pt-4">
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
}
