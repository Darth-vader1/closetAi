"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type Konva from "konva";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateFlatlayPlacement } from "@/lib/flatlay/engine";
import {
  CANVAS_ASPECT_RATIOS,
  type FlatlayAspectRatio,
  type FlatlayBackgroundStyle,
  type FlatlayComposition,
  type FlatlayItem,
  type FlatlayPreset,
} from "@/lib/flatlay/types";
import type { OutfitWithItems } from "@/lib/outfits/queries";
import type { WardrobeItem } from "@/lib/wardrobe/queries";
import { saveFlatlayAction } from "@/app/(app)/studio/flatlay/actions";
import { FlatlayToolbar } from "./flatlay-toolbar";
import { FlatlayItemDrawer } from "./flatlay-item-drawer";
import { FlatlaySaveModal } from "./flatlay-save-modal";
import { FlatlayExportModal } from "./flatlay-export-modal";
import { useLoadedImages } from "./use-loaded-images";

// Dynamically import Konva canvas so it runs purely on client
const DynamicFlatlayCanvas = dynamic(
  () => import("./flatlay-canvas").then((mod) => mod.FlatlayCanvas),
  { ssr: false, loading: () => <CanvasLoadingState /> },
);

function CanvasLoadingState() {
  return (
    <div className="flex aspect-[4/5] w-full max-w-[600px] flex-col items-center justify-center rounded-2xl border border-border bg-surface-muted p-8 text-center">
      <Loader2 className="size-8 animate-spin text-accent" />
      <p className="mt-3 text-sm font-medium text-foreground">Preparing Flatlay Studio Canvas...</p>
    </div>
  );
}

interface FlatlayStudioEditorProps {
  initialComposition?: FlatlayComposition | null;
  wardrobeItems: WardrobeItem[];
  itemImageUrls: Record<string, string>;
  savedOutfits: OutfitWithItems[];
  onSavedSuccess?: (savedId: string) => void;
}

export function FlatlayStudioEditor({
  initialComposition,
  wardrobeItems,
  itemImageUrls,
  savedOutfits,
  onSavedSuccess,
}: FlatlayStudioEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);

  // Core board state
  const [boardId, setBoardId] = useState<string | null>(initialComposition?.id ?? null);
  const [name, setName] = useState<string>(initialComposition?.name ?? "Untitled Flatlay");
  const [preset, setPreset] = useState<FlatlayPreset>(initialComposition?.preset ?? "collage");
  const [aspectRatio, setAspectRatio] = useState<FlatlayAspectRatio>(
    initialComposition?.aspectRatio ?? "4:5",
  );
  const [backgroundColor, setBackgroundColor] = useState<string>(
    initialComposition?.backgroundColor ?? "#fcfaf7",
  );
  const [backgroundStyle, setBackgroundStyle] = useState<FlatlayBackgroundStyle>(
    initialComposition?.backgroundStyle ?? "plain",
  );

  // Items and selection
  const [items, setItems] = useState<FlatlayItem[]>(() => {
    if (initialComposition?.items && initialComposition.items.length > 0) {
      return initialComposition.items;
    }
    // If opening fresh with wardrobe items available, pre-populate first 3-5 items
    const sample = wardrobeItems.slice(0, 4);
    return generateFlatlayPlacement(sample, { preset: "collage", aspectRatio: "4:5" });
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seed, setSeed] = useState<number>(42);

  // Undo/Redo stacks
  const [undoStack, setUndoStack] = useState<FlatlayItem[][]>([]);
  const [redoStack, setRedoStack] = useState<FlatlayItem[][]>([]);

  // Modals
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  // Responsive scale factor
  const [containerWidth, setContainerWidth] = useState<number>(600);

  // Preload images for canvas
  const { images } = useLoadedImages(itemImageUrls);

  const dim = CANVAS_ASPECT_RATIOS[aspectRatio] ?? { width: 1200, height: 1500 };
  const canvasWidth = dim.width;
  const canvasHeight = dim.height;

  // Measure container for responsive scale
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const scale = Math.min(1, Math.max(0.2, (containerWidth - 24) / canvasWidth));

  // Push state to undo stack
  const recordHistory = useCallback((currentItems: FlatlayItem[]) => {
    setUndoStack((prev) => [...prev.slice(-25), currentItems]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [items, ...prev]);
    setItems(previous);
  }, [undoStack, items]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setRedoStack((prev) => prev.slice(1));
    setUndoStack((prev) => [...prev, items]);
    setItems(next);
  }, [redoStack, items]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when user is typing in form inputs
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) {
        return;
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        if (selectedId) {
          e.preventDefault();
          recordHistory(items);
          setItems((prev) => prev.filter((i) => i.id !== selectedId));
          setSelectedId(null);
        }
      } else if (e.key === "Escape") {
        setSelectedId(null);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, items, recordHistory, handleUndo, handleRedo]);

  // Update item properties (drag, transform, toggle)
  const handleChangeItem = useCallback(
    (id: string, updates: Partial<FlatlayItem>) => {
      recordHistory(items);
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      );
    },
    [items, recordHistory],
  );

  // Switch Preset
  const handleSelectPreset = (newPreset: FlatlayPreset) => {
    setPreset(newPreset);
    recordHistory(items);

    // Map existing items to wardrobe records
    const itemMap = new Map(wardrobeItems.map((w) => [w.id, w]));
    const activeWardrobe = items
      .map((i) => itemMap.get(i.wardrobeItemId))
      .filter((w): w is WardrobeItem => Boolean(w));

    const arranged = generateFlatlayPlacement(activeWardrobe, {
      preset: newPreset,
      aspectRatio,
      canvasWidth,
      canvasHeight,
      seed,
    });
    setItems(arranged);
  };

  // Switch Aspect Ratio
  const handleSelectAspectRatio = (newRatio: FlatlayAspectRatio) => {
    setAspectRatio(newRatio);
    recordHistory(items);

    const newDim = CANVAS_ASPECT_RATIOS[newRatio];
    const itemMap = new Map(wardrobeItems.map((w) => [w.id, w]));
    const activeWardrobe = items
      .map((i) => itemMap.get(i.wardrobeItemId))
      .filter((w): w is WardrobeItem => Boolean(w));

    const arranged = generateFlatlayPlacement(activeWardrobe, {
      preset,
      aspectRatio: newRatio,
      canvasWidth: newDim.width,
      canvasHeight: newDim.height,
      seed,
    });
    setItems(arranged);
  };

  // Regenerate layout with alternative seed variation
  const handleRegenerate = () => {
    const nextSeed = Math.floor(Math.random() * 100000);
    setSeed(nextSeed);
    recordHistory(items);

    const itemMap = new Map(wardrobeItems.map((w) => [w.id, w]));
    const activeWardrobe = items
      .map((i) => itemMap.get(i.wardrobeItemId))
      .filter((w): w is WardrobeItem => Boolean(w));

    const arranged = generateFlatlayPlacement(activeWardrobe, {
      preset,
      aspectRatio,
      canvasWidth,
      canvasHeight,
      seed: nextSeed,
    });
    setItems(arranged);
  };

  // Reset to initial clean placement
  const handleReset = () => {
    recordHistory(items);
    const itemMap = new Map(wardrobeItems.map((w) => [w.id, w]));
    const activeWardrobe = items
      .map((i) => itemMap.get(i.wardrobeItemId))
      .filter((w): w is WardrobeItem => Boolean(w));

    const arranged = generateFlatlayPlacement(activeWardrobe, {
      preset,
      aspectRatio,
      canvasWidth,
      canvasHeight,
      seed: 42,
    });
    setItems(arranged);
  };

  // Layer ordering
  const handleMoveLayer = (direction: "up" | "down" | "top" | "bottom") => {
    if (!selectedId) return;
    recordHistory(items);

    setItems((prev) => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const currentIndex = sorted.findIndex((i) => i.id === selectedId);
      if (currentIndex === -1) return prev;

      const item = sorted[currentIndex];

      if (direction === "up" && currentIndex < sorted.length - 1) {
        sorted[currentIndex] = sorted[currentIndex + 1];
        sorted[currentIndex + 1] = item;
      } else if (direction === "down" && currentIndex > 0) {
        sorted[currentIndex] = sorted[currentIndex - 1];
        sorted[currentIndex - 1] = item;
      } else if (direction === "top") {
        sorted.splice(currentIndex, 1);
        sorted.push(item);
      } else if (direction === "bottom") {
        sorted.splice(currentIndex, 1);
        sorted.unshift(item);
      }

      return sorted.map((it, idx) => ({ ...it, zIndex: idx + 1 }));
    });
  };

  // Toggle item lock
  const handleToggleLock = () => {
    if (!selectedId) return;
    const it = items.find((i) => i.id === selectedId);
    if (!it) return;
    handleChangeItem(selectedId, { locked: !it.locked });
  };

  // Toggle item drop shadow
  const handleToggleShadow = () => {
    if (!selectedId) return;
    const it = items.find((i) => i.id === selectedId);
    if (!it) return;
    handleChangeItem(selectedId, { shadow: it.shadow === false });
  };

  // Remove selected item
  const handleRemoveSelectedItem = () => {
    if (!selectedId) return;
    recordHistory(items);
    setItems((prev) => prev.filter((i) => i.id !== selectedId));
    setSelectedId(null);
  };

  // Toggle wardrobe item in drawer
  const handleToggleWardrobeItem = (wItem: WardrobeItem) => {
    recordHistory(items);
    const existingIndex = items.findIndex((i) => i.wardrobeItemId === wItem.id);

    if (existingIndex !== -1) {
      // Remove
      setItems((prev) => prev.filter((i) => i.wardrobeItemId !== wItem.id));
      if (selectedId === items[existingIndex].id) {
        setSelectedId(null);
      }
    } else {
      // Add in open slot
      const chosenImagePath =
        wItem.beautifiedImagePath && itemImageUrls[wItem.beautifiedImagePath]
          ? wItem.beautifiedImagePath
          : wItem.imagePath;

      const newItem: FlatlayItem = {
        id: `flatlay_${wItem.id}`,
        wardrobeItemId: wItem.id,
        name: wItem.name,
        category: wItem.category,
        imagePath: chosenImagePath,
        x: canvasWidth * 0.5,
        y: canvasHeight * 0.5,
        width: canvasWidth * 0.34,
        height: canvasHeight * 0.28,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: items.length + 1,
        shadow: true,
      };
      setItems((prev) => [...prev, newItem]);
      setSelectedId(newItem.id);
    }
  };

  // Import all items from a saved outfit
  const handleImportOutfit = (outfit: OutfitWithItems) => {
    recordHistory(items);
    setName(`${outfit.name} Flatlay`);

    const arranged = generateFlatlayPlacement(outfit.items, {
      preset,
      aspectRatio,
      canvasWidth,
      canvasHeight,
      seed,
    });
    setItems(arranged);
  };

  // Confirm save
  const handleConfirmSave = async (boardName: string, saveAsOutfit: boolean) => {
    setIsSaving(true);
    setSaveBanner(null);

    try {
      const res = await saveFlatlayAction({
        id: boardId ?? undefined,
        name: boardName,
        preset,
        aspectRatio,
        canvasWidth,
        canvasHeight,
        backgroundColor,
        backgroundStyle,
        items,
        saveAsOutfit,
      });

      if (!res.ok) {
        throw new Error(res.error || "Could not save flatlay board.");
      }

      setBoardId(res.id);
      setName(boardName);
      setSaveBanner("Flatlay board saved successfully!");
      onSavedSuccess?.(res.id);
      setTimeout(() => setSaveBanner(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;
  const selectedItemIds = items.map((i) => i.wardrobeItemId);

  return (
    <div className="space-y-6">
      {/* Save Success Banner */}
      {saveBanner && (
        <div className="rounded-2xl border border-success/30 bg-success-soft/40 p-4 text-xs font-medium text-success animate-in fade-in">
          ✓ {saveBanner}
        </div>
      )}

      {/* Editor Main Toolbar */}
      <FlatlayToolbar
        preset={preset}
        onSelectPreset={handleSelectPreset}
        aspectRatio={aspectRatio}
        onSelectAspectRatio={handleSelectAspectRatio}
        backgroundColor={backgroundColor}
        onSelectBackgroundColor={setBackgroundColor}
        backgroundStyle={backgroundStyle}
        onSelectBackgroundStyle={setBackgroundStyle}
        selectedItem={selectedItem}
        onMoveLayer={handleMoveLayer}
        onToggleLock={handleToggleLock}
        onToggleShadow={handleToggleShadow}
        onRemoveItem={handleRemoveSelectedItem}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onRegenerate={handleRegenerate}
        onReset={handleReset}
        onOpenItemPicker={() => setIsDrawerOpen(true)}
        onSave={() => setIsSaveModalOpen(true)}
        isSaving={isSaving}
        onExport={() => setIsExportModalOpen(true)}
        isExporting={false}
        itemCount={items.length}
      />

      {/* Canvas Workspace Container */}
      <div
        ref={containerRef}
        className="flex min-h-[500px] w-full flex-col items-center justify-center rounded-3xl border border-border bg-surface-muted/30 p-4 sm:p-8"
      >
        {items.length === 0 ? (
          <div className="flex aspect-[4/5] w-full max-w-[500px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border bg-surface p-8 text-center shadow-xs">
            <Sparkles className="size-8 text-accent" />
            <h3 className="mt-3 text-lg font-medium text-foreground">Canvas is Empty</h3>
            <p className="mt-1 text-xs text-muted max-w-xs">
              Add tops, trousers, shoes, or accessories from your wardrobe to compose your fashion flatlay.
            </p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setIsDrawerOpen(true)}
              className="mt-5 gap-1.5"
            >
              <Plus className="size-4" />
              <span>Add Clothes to Board</span>
            </Button>
          </div>
        ) : (
          <div
            className="relative overflow-hidden rounded-2xl border border-border/80 shadow-xl transition-all"
            style={{
              width: canvasWidth * scale,
              height: canvasHeight * scale,
            }}
          >
            <DynamicFlatlayCanvas
              items={items}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChangeItem={handleChangeItem}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              backgroundColor={backgroundColor}
              backgroundStyle={backgroundStyle}
              images={images}
              scale={scale}
              stageRef={stageRef}
            />
          </div>
        )}
      </div>

      {/* Wardrobe Garments Drawer */}
      <FlatlayItemDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        wardrobeItems={wardrobeItems}
        itemImageUrls={itemImageUrls}
        selectedItemIds={selectedItemIds}
        onToggleItem={handleToggleWardrobeItem}
        savedOutfits={savedOutfits}
        onImportOutfit={handleImportOutfit}
      />

      {/* Save Modal */}
      <FlatlaySaveModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        defaultName={name}
        onConfirmSave={handleConfirmSave}
        isSaving={isSaving}
      />

      {/* Export Modal */}
      <FlatlayExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        boardName={name}
        stageRef={stageRef}
        onDeselect={() => setSelectedId(null)}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
      />
    </div>
  );
}
