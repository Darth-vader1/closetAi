"use client";

import {
  ArrowDown,
  ArrowUp,
  Download,
  Flame,
  Layout,
  Lock,
  LockOpen,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  Layers,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  FlatlayAspectRatio,
  FlatlayBackgroundStyle,
  FlatlayItem,
  FlatlayPreset,
} from "@/lib/flatlay/types";
import {
  CANVAS_ASPECT_RATIOS,
  FLATLAY_BACKGROUND_COLORS,
} from "@/lib/flatlay/types";

interface FlatlayToolbarProps {
  preset: FlatlayPreset;
  onSelectPreset: (p: FlatlayPreset) => void;
  aspectRatio: FlatlayAspectRatio;
  onSelectAspectRatio: (r: FlatlayAspectRatio) => void;
  backgroundColor: string;
  onSelectBackgroundColor: (color: string) => void;
  backgroundStyle: FlatlayBackgroundStyle;
  onSelectBackgroundStyle: (style: FlatlayBackgroundStyle) => void;
  selectedItem: FlatlayItem | null;
  onMoveLayer: (direction: "up" | "down" | "top" | "bottom") => void;
  onToggleLock: () => void;
  onToggleShadow: () => void;
  onRemoveItem: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onRegenerate: () => void;
  onReset: () => void;
  onOpenItemPicker: () => void;
  onSave: () => void;
  isSaving: boolean;
  onExport: () => void;
  isExporting: boolean;
  itemCount: number;
}

const PRESET_OPTIONS: Array<{ value: FlatlayPreset; label: string; icon: string }> = [
  { value: "collage", label: "Reference Collage", icon: "✨" },
  { value: "editorial", label: "Editorial", icon: "📖" },
  { value: "streetwear", label: "Streetwear", icon: "⚡" },
  { value: "minimal", label: "Minimal", icon: "🌿" },
  { value: "catalogue", label: "Catalogue", icon: "▦" },
];

export function FlatlayToolbar({
  preset,
  onSelectPreset,
  aspectRatio,
  onSelectAspectRatio,
  backgroundColor,
  onSelectBackgroundColor,
  backgroundStyle,
  onSelectBackgroundStyle,
  selectedItem,
  onMoveLayer,
  onToggleLock,
  onToggleShadow,
  onRemoveItem,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onRegenerate,
  onReset,
  onOpenItemPicker,
  onSave,
  isSaving,
  onExport,
  isExporting,
  itemCount,
}: FlatlayToolbarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-2xs">
      {/* Top Row: Presets, Undo/Redo, Main Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Preset Selector Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted mr-1 hidden sm:inline">Preset:</span>
          {PRESET_OPTIONS.map((p) => {
            const active = preset === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onSelectPreset(p.value)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-accent text-accent-foreground shadow-2xs"
                    : "bg-surface-muted text-muted hover:bg-surface-muted/80 hover:text-foreground"
                }`}
              >
                <span>{p.icon}</span>
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-1.5 ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onUndo}
            disabled={!canUndo}
            className="h-8 w-8 p-0"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRedo}
            disabled={!canRedo}
            className="h-8 w-8 p-0"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="size-3.5" />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={itemCount === 0}
            className="gap-1.5 text-xs"
            title="Create an alternative layout with the current garments"
          >
            <RefreshCw className="size-3.5" />
            <span className="hidden sm:inline">Regenerate</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenItemPicker}
            className="gap-1.5 text-xs"
          >
            <Plus className="size-3.5 text-accent" />
            <span>Add Garments ({itemCount})</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onSave}
            loading={isSaving}
            className="gap-1.5 text-xs"
          >
            <Save className="size-3.5" />
            <span>Save</span>
          </Button>

          <Button
            type="button"
            variant="dark"
            size="sm"
            onClick={onExport}
            loading={isExporting}
            className="gap-1.5 text-xs"
          >
            <Download className="size-3.5" />
            <span>Export PNG</span>
          </Button>
        </div>
      </div>

      {/* Secondary Row: Canvas Ratio, Backgrounds, and Selected Item Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        {/* Left: Canvas Aspect Ratio & Background Colors */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Ratio Selector */}
          <div className="flex items-center gap-1">
            <span className="text-muted">Ratio:</span>
            {(Object.keys(CANVAS_ASPECT_RATIOS) as FlatlayAspectRatio[]).map((r) => {
              const active = aspectRatio === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => onSelectAspectRatio(r)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                    active
                      ? "bg-foreground text-background"
                      : "bg-surface-muted text-muted hover:text-foreground"
                  }`}
                >
                  {r}
                </button>
              );
            })}
          </div>

          {/* Background Color Swatches */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-border">
            <span className="text-muted">Backdrop:</span>
            <div className="flex items-center gap-1">
              {FLATLAY_BACKGROUND_COLORS.slice(0, 6).map((c) => {
                const active = backgroundColor === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => onSelectBackgroundColor(c.value)}
                    className={`size-5 rounded-full border transition hover:scale-110 ${
                      active ? "border-accent ring-2 ring-accent/30" : "border-border"
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                );
              })}
            </div>

            {/* Frame border style toggle */}
            <button
              type="button"
              onClick={() =>
                onSelectBackgroundStyle(
                  backgroundStyle === "editorial_frame" ? "plain" : "editorial_frame",
                )
              }
              className={`ml-1 rounded-lg px-2 py-1 text-[11px] font-medium border transition ${
                backgroundStyle === "editorial_frame"
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-surface-muted text-muted hover:text-foreground"
              }`}
            >
              Frame
            </button>
          </div>
        </div>

        {/* Right: Selected Item Controls (Visible when an item is selected) */}
        {selectedItem ? (
          <div className="flex items-center gap-1.5 rounded-xl border border-accent/20 bg-accent-soft/30 px-2.5 py-1 text-xs">
            <span className="font-medium text-accent truncate max-w-[120px]">
              {selectedItem.name}
            </span>

            {/* Layer controls */}
            <div className="flex items-center gap-1 pl-2 border-l border-accent/20">
              <button
                type="button"
                onClick={() => onMoveLayer("up")}
                className="grid size-6 place-items-center rounded hover:bg-accent-soft text-foreground"
                title="Bring Forward"
              >
                <ArrowUp className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => onMoveLayer("down")}
                className="grid size-6 place-items-center rounded hover:bg-accent-soft text-foreground"
                title="Send Backward"
              >
                <ArrowDown className="size-3" />
              </button>
              <button
                type="button"
                onClick={onToggleLock}
                className="grid size-6 place-items-center rounded hover:bg-accent-soft text-foreground"
                title={selectedItem.locked ? "Unlock" : "Lock Position"}
              >
                {selectedItem.locked ? <Lock className="size-3 text-accent" /> : <LockOpen className="size-3 text-muted" />}
              </button>
              <button
                type="button"
                onClick={onToggleShadow}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition ${
                  selectedItem.shadow !== false
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface text-muted"
                }`}
                title="Toggle Drop Shadow"
              >
                Shadow
              </button>
              <button
                type="button"
                onClick={onRemoveItem}
                className="grid size-6 place-items-center rounded text-danger hover:bg-danger-soft ml-1"
                title="Delete from Canvas"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted italic">
            Tap any garment on canvas to rotate, resize, or re-layer.
          </p>
        )}
      </div>
    </div>
  );
}
