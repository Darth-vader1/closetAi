"use client";

import { useState } from "react";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

interface FlatlaySaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultName: string;
  onConfirmSave: (name: string, saveAsOutfit: boolean) => Promise<void>;
  isSaving: boolean;
}

export function FlatlaySaveModal({
  isOpen,
  onClose,
  defaultName,
  onConfirmSave,
  isSaving,
}: FlatlaySaveModalProps) {
  const [name, setName] = useState(defaultName || "My Flatlay Board");
  const [saveAsOutfit, setSaveAsOutfit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please name your flatlay board.");
      return;
    }
    setError(null);
    try {
      await onConfirmSave(name.trim(), saveAsOutfit);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Save className="size-5 text-accent" />
            <h2 className="text-xl font-medium">Save Flatlay Board</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full hover:bg-surface-muted text-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-danger/30 bg-danger-soft/40 p-3 text-xs text-danger">
              {error}
            </div>
          )}

          <Field id="flatlay-name" label="Board Name">
            <Input
              id="flatlay-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Autumn Streetwear, Paris Capsule"
              autoFocus
            />
          </Field>

          {/* Also save as Outfit Checkbox */}
          <label className="flex items-start gap-3 rounded-2xl border border-border bg-surface-muted/30 p-3 text-xs cursor-pointer hover:bg-surface-muted/60 transition">
            <input
              type="checkbox"
              checked={saveAsOutfit}
              onChange={(e) => setSaveAsOutfit(e.target.checked)}
              className="mt-0.5 size-4 rounded accent-accent"
            />
            <div>
              <p className="font-medium text-foreground">Also save as a ClosetAI Outfit</p>
              <p className="text-muted mt-0.5">
                Automatically links this garment combination to your saved outfits list for logging wears and daily styling.
              </p>
            </div>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={isSaving} disabled={!name.trim()}>
              Save Board
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
