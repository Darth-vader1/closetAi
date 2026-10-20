"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Camera, Check, Heart, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { deleteOutfitAction, saveOutfitAction, toggleOutfitFavouriteAction } from "@/app/(app)/studio/actions";
import { Button } from "@/components/ui/button";
import { Alert, Card, EmptyState } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { ItemImage } from "@/components/wardrobe/item-image";
import { OCCASION_OPTIONS } from "@/lib/profile/options";
import { categoryGroup, categoryLabel } from "@/lib/wardrobe/categories";
import type { OutfitWithItems } from "@/lib/outfits/queries";
import type { OutfitSuggestion } from "@/lib/outfits/engine";
import type { WardrobeItem } from "@/lib/wardrobe/queries";
import { prepareImage, uploadPhoto } from "@/lib/wardrobe/upload-client";
import type { FlatlayComposition } from "@/lib/flatlay/types";
import { generateFlatlayPlacement } from "@/lib/flatlay/engine";
import { FlatlayStudioEditor } from "./flatlay/flatlay-studio-editor";
import { FlatlaySavedList } from "./flatlay/flatlay-saved-list";

interface OutfitStudioProps {
  initialOutfits: OutfitWithItems[];
  wardrobeItems: WardrobeItem[];
  itemImageUrls: Record<string, string>;
  photoUrls: Record<string, string>;
  initialSuggestions: OutfitSuggestion[];
  initialFlatlays?: FlatlayComposition[];
}

type Tab = "flatlay" | "builder" | "generator" | "saved";

export function OutfitStudio({
  initialOutfits,
  wardrobeItems,
  itemImageUrls,
  photoUrls,
  initialSuggestions,
  initialFlatlays = [],
}: OutfitStudioProps) {
  const [tab, setTab] = useState<Tab>("flatlay");
  const [outfits, setOutfits] = useState<OutfitWithItems[]>(initialOutfits);
  const [suggestions, setSuggestions] = useState<OutfitSuggestion[]>(initialSuggestions);
  const [currentPhotoUrls, setCurrentPhotoUrls] = useState<Record<string, string>>(photoUrls);

  // Flatlay State
  const [flatlays, setFlatlays] = useState<FlatlayComposition[]>(initialFlatlays);
  const [editingFlatlay, setEditingFlatlay] = useState<FlatlayComposition | null>(null);
  const [flatlayView, setFlatlayView] = useState<"editor" | "saved">("editor");

  // Manual Builder state
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [outfitName, setOutfitName] = useState("");
  const [selectedOccasion, setSelectedOccasion] = useState<string>("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Filter for picker
  const [pickerFilter, setPickerFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const selectedItems = wardrobeItems.filter((i) => selectedItemIds.includes(i.id));

  // Toggle garment in manual builder
  const toggleItem = (id: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
    setSaveSuccess(false);
  };

  // Handle full-body outfit picture upload
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setBuilderError(null);
    const controller = new AbortController();
    try {
      const preview = URL.createObjectURL(file);
      setPhotoPreview(preview);
      const blob = await prepareImage(file);
      const path = await uploadPhoto(blob, {
        signal: controller.signal,
        onProgress: () => {},
      });
      setPhotoPath(path);
    } catch (err) {
      setPhotoPreview(null);
      setPhotoPath(null);
      setBuilderError(err instanceof Error ? err.message : "Failed to upload outfit photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Save manual outfit
  const handleSaveOutfit = () => {
    if (selectedItemIds.length < 2) {
      setBuilderError("Please select at least 2 garments to create an outfit (e.g. top + bottom).");
      return;
    }
    if (!outfitName.trim()) {
      setBuilderError("Please give this outfit a name.");
      return;
    }

    setBuilderError(null);
    startTransition(async () => {
      const res = await saveOutfitAction({
        name: outfitName.trim(),
        itemIds: selectedItemIds,
        occasion: selectedOccasion || null,
        photoPath: photoPath || null,
        isFavourite: false,
      });

      if (!res.ok) {
        setBuilderError(res.error || "Failed to save outfit.");
        return;
      }

      setSaveSuccess(true);
      // Create local item to update UI immediately
      const newOutfit: OutfitWithItems = {
        id: res.id,
        userId: "",
        name: outfitName.trim(),
        occasion: selectedOccasion || null,
        styleDescription: null,
        explanation: null,
        stylingTip: null,
        photoPath,
        source: "MANUAL",
        isFavourite: false,
        createdAt: new Date().toISOString(),
        items: selectedItems,
      };
      if (photoPath && photoPreview) {
        setCurrentPhotoUrls((prev) => ({ ...prev, [photoPath]: photoPreview }));
      }
      setOutfits((prev) => [newOutfit, ...prev]);
      setSelectedItemIds([]);
      setOutfitName("");
      setPhotoPath(null);
      setPhotoPreview(null);
      setTab("saved");
    });
  };

  // Save an auto-suggested outfit
  const handleSaveSuggestion = (s: OutfitSuggestion) => {
    startTransition(async () => {
      const res = await saveOutfitAction({
        name: s.name,
        itemIds: s.items.map((i) => i.id),
        occasion: s.occasion || null,
        styleDescription: s.styleDescription,
        stylingTip: s.stylingTip,
        isFavourite: false,
      });

      if (res.ok) {
        const newOutfit: OutfitWithItems = {
          id: res.id,
          userId: "",
          name: s.name,
          occasion: s.occasion || null,
          styleDescription: s.styleDescription,
          explanation: null,
          stylingTip: s.stylingTip,
          photoPath: null,
          source: "ENGINE",
          isFavourite: false,
          createdAt: new Date().toISOString(),
          items: s.items,
        };
        setOutfits((prev) => [newOutfit, ...prev]);
        setSuggestions((prev) => prev.filter((item) => item.name !== s.name));
      }
    });
  };

  // Delete outfit
  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteOutfitAction(id);
      setOutfits((prev) => prev.filter((o) => o.id !== id));
    });
  };

  // Toggle favourite
  const handleToggleFavourite = (id: string, current: boolean) => {
    startTransition(async () => {
      await toggleOutfitFavouriteAction(id, !current);
      setOutfits((prev) =>
        prev.map((o) => (o.id === id ? { ...o, isFavourite: !current } : o))
      );
    });
  };

  // Open any saved outfit directly inside Flatlay Studio
  const handleOpenOutfitInFlatlay = (outfit: OutfitWithItems) => {
    const arranged = generateFlatlayPlacement(outfit.items, {
      preset: "collage",
      aspectRatio: "4:5",
    });

    setEditingFlatlay({
      id: "",
      userId: "",
      name: `${outfit.name} Flatlay`,
      preset: "collage",
      aspectRatio: "4:5",
      canvasWidth: 1200,
      canvasHeight: 1500,
      backgroundColor: "#fcfaf7",
      backgroundStyle: "plain",
      items: arranged,
      outfitId: outfit.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setTab("flatlay");
    setFlatlayView("editor");
  };

  const filteredWardrobe = wardrobeItems.filter((item) => {
    if (pickerFilter === "all") return true;
    return categoryGroup(item.category) === pickerFilter;
  });

  return (
    <div className="space-y-6">
      {/* Top Navigation Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            type="button"
            size="sm"
            className="flex-1 sm:flex-initial sm:min-h-11 sm:px-5 sm:text-sm"
            variant={tab === "flatlay" ? "primary" : "outline"}
            onClick={() => setTab("flatlay")}
          >
            <Sparkles className="mr-1.5 size-4 shrink-0 text-accent-contrast" /> Flatlay Studio
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1 sm:flex-initial sm:min-h-11 sm:px-5 sm:text-sm"
            variant={tab === "builder" ? "primary" : "outline"}
            onClick={() => setTab("builder")}
          >
            <Plus className="mr-1 size-4 shrink-0" /> Pair Clothes
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1 sm:flex-initial sm:min-h-11 sm:px-5 sm:text-sm"
            variant={tab === "generator" ? "primary" : "outline"}
            onClick={() => setTab("generator")}
          >
            Auto-Generate
          </Button>
          <Button
            type="button"
            size="sm"
            className="w-full sm:w-auto sm:min-h-11 sm:px-5 sm:text-sm"
            variant={tab === "saved" ? "primary" : "outline"}
            onClick={() => setTab("saved")}
          >
            Saved Outfits ({outfits.length})
          </Button>
        </div>
      </div>

      {/* TAB 0: FLATLAY STUDIO */}
      {tab === "flatlay" && (
        <div className="space-y-6">
          {/* Sub-header navigation: Editor vs Saved Boards */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={flatlayView === "editor" ? "dark" : "outline"}
                onClick={() => setFlatlayView("editor")}
                className="text-xs"
              >
                Canvas Editor
              </Button>
              <Button
                type="button"
                size="sm"
                variant={flatlayView === "saved" ? "dark" : "outline"}
                onClick={() => setFlatlayView("saved")}
                className="text-xs"
              >
                Saved Boards ({flatlays.length})
              </Button>
            </div>

            {flatlayView === "saved" && (
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => {
                  setEditingFlatlay(null);
                  setFlatlayView("editor");
                }}
                className="gap-1.5 text-xs"
              >
                <Plus className="size-3.5" />
                <span>New Board</span>
              </Button>
            )}
          </div>

          {flatlayView === "editor" ? (
            <FlatlayStudioEditor
              key={editingFlatlay?.id ?? "fresh_editor"}
              initialComposition={editingFlatlay}
              wardrobeItems={wardrobeItems}
              itemImageUrls={itemImageUrls}
              savedOutfits={outfits}
              onSavedSuccess={(savedId) => {
                // Refresh list
                const existing = flatlays.find((f) => f.id === savedId);
                if (!existing) {
                  // will re-fetch or keep in state
                }
              }}
            />
          ) : (
            <FlatlaySavedList
              compositions={flatlays}
              itemImageUrls={itemImageUrls}
              onEditComposition={(comp) => {
                setEditingFlatlay(comp);
                setFlatlayView("editor");
              }}
              onCreateNew={() => {
                setEditingFlatlay(null);
                setFlatlayView("editor");
              }}
              onCompositionDeleted={(id) => {
                setFlatlays((prev) => prev.filter((f) => f.id !== id));
              }}
            />
          )}
        </div>
      )}

      {/* TAB 1: MANUAL BUILDER */}
      {tab === "builder" && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Column: Outfit Canvas & Details */}
          <div className="space-y-6 lg:col-span-5">
            <Card className="space-y-5 p-5">
              <h2 className="text-xl font-medium">Outfit Canvas</h2>
              <p className="text-sm text-muted">
                Tap garments from your wardrobe on the right to assemble a look.
              </p>

              {builderError && <Alert tone="danger">{builderError}</Alert>}
              {saveSuccess && <Alert tone="success">Outfit saved to your lookbook!</Alert>}

              {/* Selected Items Collage */}
              {selectedItems.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface-muted p-4 text-center">
                  <p className="text-sm text-muted">No garments added yet.</p>
                  <p className="mt-1 text-xs text-muted">Select at least a top and a bottom.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {selectedItems.map((item) => (
                    <div key={item.id} className="group relative rounded-xl border border-border bg-surface p-2">
                      <ItemImage
                        url={itemImageUrls[item.imagePath]}
                        alt={item.name}
                        className="aspect-square w-full rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => toggleItem(item.id)}
                        className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-background/90 text-foreground shadow transition hover:bg-danger hover:text-white"
                        title="Remove"
                      >
                        <X className="size-4" />
                      </button>
                      <p className="mt-1 truncate text-xs font-medium">{item.name}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Full Body Photo Upload */}
              <div className="space-y-2 border-t border-border pt-4">
                <label className="block text-sm font-medium">
                  Full-Body Photo <span className="font-normal text-muted">(optional OOTD)</span>
                </label>
                {photoPreview ? (
                  <div className="relative aspect-[3/4] max-h-56 w-36 overflow-hidden rounded-xl border border-border">
                    <Image src={photoPreview} alt="Full-body worn outfit" fill className="object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoPreview(null);
                        setPhotoPath(null);
                      }}
                      className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-background/90 text-foreground shadow hover:bg-danger hover:text-white"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-24 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-muted text-sm text-muted hover:bg-surface">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handlePhotoSelect}
                      className="sr-only"
                    />
                    <div className="flex items-center gap-2">
                      {uploadingPhoto ? (
                        <Loader2 className="size-5 animate-spin text-accent" />
                      ) : (
                        <Camera className="size-5 text-accent" />
                      )}
                      <span>{uploadingPhoto ? "Uploading photo..." : "Upload full-body mirror selfie"}</span>
                    </div>
                  </label>
                )}
              </div>

              {/* Outfit Meta Inputs */}
              <div className="space-y-4 border-t border-border pt-4">
                <Field id="outfitName" label="Outfit Name">
                  <Input
                    id="outfitName"
                    value={outfitName}
                    onChange={(e) => setOutfitName(e.target.value)}
                    placeholder="e.g. Autumn Casual, Friday Office Look"
                  />
                </Field>

                <Field id="occasion" label="Occasion (optional)">
                  <Select
                    id="occasion"
                    value={selectedOccasion}
                    onChange={(e) => setSelectedOccasion(e.target.value)}
                  >
                    <option value="">Any occasion</option>
                    {OCCASION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Button
                  type="button"
                  onClick={handleSaveOutfit}
                  loading={isPending}
                  className="w-full"
                  disabled={selectedItems.length < 2 || !outfitName.trim()}
                >
                  Save Outfit
                </Button>
              </div>
            </Card>
          </div>

          {/* Right Column: Wardrobe Item Picker */}
          <div className="space-y-4 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-medium">Pick Garments from Wardrobe</h2>
              {/* Category Filter Pills */}
              <div className="flex flex-wrap gap-1.5 text-xs">
                {["all", "top", "bottom", "footwear", "outerwear", "accessory"].map((group) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setPickerFilter(group)}
                    className={`rounded-lg px-2.5 py-1 capitalize transition ${
                      pickerFilter === group
                        ? "bg-accent text-white"
                        : "bg-surface-muted text-muted hover:text-foreground"
                    }`}
                  >
                    {group}
                  </button>
                ))}
              </div>
            </div>

            {filteredWardrobe.length === 0 ? (
              <EmptyState title="No garments found" icon={Plus}>
                No clean garments in this category. Head to Laundry to check your wash status.
              </EmptyState>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {filteredWardrobe.map((item) => {
                  const isSelected = selectedItemIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      className={`group relative flex flex-col w-full overflow-hidden rounded-xl border bg-surface text-left transition ${
                        isSelected
                          ? "border-accent ring-2 ring-accent/30"
                          : "border-border hover:border-foreground/30"
                      }`}
                    >
                      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-surface-muted">
                        <ItemImage
                          url={itemImageUrls[item.imagePath]}
                          alt={item.name}
                          className="size-full object-cover"
                        />
                        {isSelected && (
                          <div className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-accent text-white shadow">
                            <Check className="size-3.5" />
                          </div>
                        )}
                      </div>
                      <div className="p-2.5 w-full">
                        <p className="truncate text-xs font-medium">{item.name}</p>
                        <p className="truncate text-[11px] text-muted">{categoryLabel(item.category)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: AI / RULE ENGINE SUGGESTIONS */}
      {tab === "generator" && (
        <div className="space-y-6">
          <div className="max-w-xl space-y-1">
            <h2 className="text-xl font-medium">Automatic Outfit Ideas</h2>
            <p className="text-sm text-muted">
              Built exclusively from garments that are currently washed and ready to wear.
            </p>
          </div>

          {suggestions.length === 0 ? (
            <EmptyState title="No outfit ideas available yet" icon={Sparkles}>
              You need at least one top, one bottom, and shoes in clean status for recommendations to generate.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((s, idx) => (
                <Card key={idx} className="flex flex-col justify-between p-5">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-medium">{s.name}</h3>
                        <p className="text-xs text-muted">{s.styleDescription}</p>
                      </div>
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                        {s.score} pts
                      </span>
                    </div>

                    {/* Garments Preview Grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {s.items.map((item) => (
                        <div key={item.id} className="min-w-0 rounded-lg border border-border p-1">
                          <ItemImage
                            url={itemImageUrls[item.imagePath]}
                            alt={item.name}
                            className="aspect-square w-full rounded-md object-cover"
                          />
                          <p className="mt-1 truncate text-[11px] font-medium">{item.name}</p>
                        </div>
                      ))}
                    </div>

                    <p className="rounded-lg bg-surface-muted p-2.5 text-xs text-muted">
                      💡 {s.stylingTip}
                    </p>
                  </div>

                  <Button
                    type="button"
                    onClick={() => handleSaveSuggestion(s)}
                    loading={isPending}
                    className="mt-5 w-full"
                  >
                    Save to My Outfits
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SAVED OUTFITS LOOKBOOK */}
      {tab === "saved" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-medium">Your Outfits ({outfits.length})</h2>
              <p className="text-sm text-muted">Your curated looks and combinations.</p>
            </div>
            <Button type="button" className="w-full sm:w-auto" onClick={() => setTab("builder")}>
              <Plus className="mr-1.5 size-4" /> Create New Outfit
            </Button>
          </div>

          {outfits.length === 0 ? (
            <EmptyState
              title="You haven't created any outfits yet"
              icon={Sparkles}
              action={<Button onClick={() => setTab("builder")}>Pair your first outfit</Button>}
            >
              Combine pieces from your wardrobe to plan your outfits ahead of time.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {outfits.map((outfit) => (
                <Card key={outfit.id} className="flex flex-col justify-between overflow-hidden p-5">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-medium">{outfit.name}</h3>
                        {outfit.occasion && (
                          <span className="text-xs capitalize text-muted">
                            {outfit.occasion.replace("_", " ")}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleFavourite(outfit.id, outfit.isFavourite)}
                        className={`shrink-0 transition hover:scale-110 ${
                          outfit.isFavourite ? "text-danger" : "text-muted hover:text-foreground"
                        }`}
                      >
                        <Heart className="size-5" fill={outfit.isFavourite ? "currentColor" : "none"} />
                      </button>
                    </div>

                    {/* Display Full-Body Picture if present, else Composite Grid */}
                    {outfit.photoPath && currentPhotoUrls[outfit.photoPath] ? (
                      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-border">
                        <Image
                          src={currentPhotoUrls[outfit.photoPath]}
                          alt={outfit.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {outfit.items.map((item) => (
                          <div key={item.id} className="min-w-0 rounded-lg border border-border p-1">
                            <ItemImage
                              url={itemImageUrls[item.imagePath]}
                              alt={item.name}
                              className="aspect-square w-full rounded-md object-cover"
                            />
                            <p className="mt-1 truncate text-[11px] font-medium">{item.name}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {outfit.stylingTip && (
                      <p className="text-xs text-muted">💡 {outfit.stylingTip}</p>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <span className="text-xs text-muted">
                      {outfit.items.length} {outfit.items.length === 1 ? "garment" : "garments"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenOutfitInFlatlay(outfit)}
                        className="h-7 text-[11px] gap-1 px-2.5"
                      >
                        <Sparkles className="size-3 text-accent" />
                        <span>Flatlay Board</span>
                      </Button>
                      <button
                        type="button"
                        onClick={() => handleDelete(outfit.id)}
                        className="grid size-7 place-items-center rounded-lg text-muted hover:text-danger hover:bg-danger-soft transition"
                        title="Delete outfit"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
