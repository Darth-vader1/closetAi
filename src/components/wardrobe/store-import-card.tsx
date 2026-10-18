"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardPaste,
  ExternalLink,
  Globe,
  ImagePlus,
  Loader2,
  Sparkles,
  Store,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import type { DuplicateWardrobeMatch } from "@/lib/import/duplicate-check";
import {
  mapProductMetadataToWardrobeFields,
  type ExtractedProductImage,
  type ExtractedProductMetadata,
  type ProductImageKind,
} from "@/lib/import/extract-product";
import type { ItemFieldsInput } from "@/lib/validation/wardrobe";

export interface ImportedEntryPayload {
  file: File;
  previewUrl: string;
  originalPath: string;
  initialValues: ItemFieldsInput;
  sourceUrl: string;
  sourceBrand: string | null;
  sourceImageSha256: string;
  allowDuplicate: boolean;
  runCutout: boolean;
  runAiAnalysis: boolean;
}

interface EditableMetadata {
  title: string;
  brand: string;
  color: string;
  material: string;
  category: string;
  description: string;
}

function badgeForImageKind(
  kind: ProductImageKind,
  isRecommended: boolean,
): { label: string; tone: string } {
  if (isRecommended && kind === "garment-only") {
    return {
      label: "Recommended · Garment",
      tone: "bg-accent text-accent-foreground",
    };
  }
  if (isRecommended) {
    return {
      label: "Recommended",
      tone: "bg-accent text-accent-foreground",
    };
  }
  switch (kind) {
    case "garment-only":
      return {
        label: "Garment photo",
        tone: "bg-surface/95 text-foreground",
      };
    case "model":
      return {
        label: "Model photo",
        tone: "bg-surface/95 text-muted",
      };
    case "detail":
      return {
        label: "Detail view",
        tone: "bg-surface/95 text-muted",
      };
    default:
      return {
        label: "Gallery photo",
        tone: "bg-surface/95 text-muted",
      };
  }
}

function sourceLabel(source: ExtractedProductMetadata["extractionSource"]): string {
  switch (source) {
    case "json-ld":
      return "Schema.org Product";
    case "opengraph":
      return "OpenGraph metadata";
    case "microdata":
      return "Store HTML metadata";
    default:
      return "Store page";
  }
}

async function dataUrlToFile(
  dataUrl: string,
  filename: string,
  mimeType: string,
): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: mimeType || blob.type || "image/jpeg" });
}

export function StoreImportCard({
  aiAvailable,
  externalPastedUrl,
  urlInputRef,
  onImportReady,
  onFallbackFilesWithMetadata,
}: {
  aiAvailable: boolean;
  externalPastedUrl: { url: string; key: number } | null;
  urlInputRef: React.RefObject<HTMLInputElement | null>;
  onImportReady: (payload: ImportedEntryPayload) => void;
  onFallbackFilesWithMetadata: (
    files: FileList | File[],
    context?: {
      initialValues: ItemFieldsInput;
      sourceUrl: string | null;
      sourceBrand: string | null;
      allowDuplicate: boolean;
    },
  ) => void;
}) {
  const [url, setUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [error, setError] = useState<{
    message: string;
    fallbackHint?: string;
  } | null>(null);

  const [product, setProduct] = useState<ExtractedProductMetadata | null>(null);
  const [edited, setEdited] = useState<EditableMetadata>({
    title: "",
    brand: "",
    color: "",
    material: "",
    category: "",
    description: "",
  });
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [failedImageIndices, setFailedImageIndices] = useState<Set<number>>(
    () => new Set(),
  );
  const [warnings, setWarnings] = useState<string[]>([]);
  const [duplicateItem, setDuplicateItem] =
    useState<DuplicateWardrobeMatch | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  // Optional post-import processing toggles (off by default to avoid unnecessary AI expenditure)
  const [runCutout, setRunCutout] = useState(false);
  const [runAiAnalysis, setRunAiAnalysis] = useState(false);

  const fallbackFileInputRef = useRef<HTMLInputElement>(null);

  const extractFromUrl = useCallback(async (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) {
      setError({ message: "Please enter or paste a product URL from an online store." });
      return;
    }

    setExtracting(true);
    setError(null);
    setProduct(null);
    setWarnings([]);
    setDuplicateItem(null);
    setAllowDuplicate(false);
    setFailedImageIndices(new Set());

    try {
      const res = await fetch("/api/wardrobe/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        fallbackHint?: string;
        product?: ExtractedProductMetadata;
        warnings?: string[];
        duplicateItem?: DuplicateWardrobeMatch | null;
      } | null;

      if (!res.ok || !body?.ok || !body.product) {
        setError({
          message:
            body?.error ??
            "We couldn't extract product details from that link.",
          fallbackHint:
            body?.fallbackHint ??
            "You can copy the product image from the store page and press Ctrl+V here, or upload a screenshot.",
        });
        return;
      }

      const extracted = body.product;
      setProduct(extracted);
      setEdited({
        title: extracted.title ?? "",
        brand: extracted.brand ?? "",
        color: extracted.color ?? "",
        material: extracted.material ?? "",
        category: extracted.category ?? "",
        description: extracted.description ?? "",
      });
      setSelectedImageIndex(extracted.recommendedImageIndex ?? 0);
      setWarnings(body.warnings ?? []);
      setDuplicateItem(body.duplicateItem ?? null);
    } catch {
      setError({
        message: "Network error while contacting the store import service.",
        fallbackHint:
          "Check your connection or upload/paste the product photo directly.",
      });
    } finally {
      setExtracting(false);
    }
  }, []);

  // Respond when the user presses Ctrl+V with a store URL anywhere on /wardrobe/new
  const lastHandledPasteKey = useRef<number>(0);
  useEffect(() => {
    if (
      externalPastedUrl &&
      externalPastedUrl.key !== lastHandledPasteKey.current
    ) {
      lastHandledPasteKey.current = externalPastedUrl.key;
      setUrl(externalPastedUrl.url);
      void extractFromUrl(externalPastedUrl.url);
    }
  }, [externalPastedUrl, extractFromUrl]);

  const buildEditedInitialValues = useCallback((): ItemFieldsInput => {
    return mapProductMetadataToWardrobeFields({
      title: edited.title.trim() || null,
      brand: edited.brand.trim() || null,
      description: edited.description.trim() || null,
      color: edited.color.trim() || null,
      material: edited.material.trim() || null,
      category: edited.category.trim() || null,
    });
  }, [edited]);

  const handleContinueToReview = useCallback(async () => {
    if (!product) return;
    if (duplicateItem && !allowDuplicate) {
      setError({
        message: `This item is already in your wardrobe ("${duplicateItem.name}"). Tick "Import anyway" below if you want to save a second copy.`,
      });
      return;
    }

    const chosenImage: ExtractedProductImage | undefined =
      product.images[selectedImageIndex];
    if (!chosenImage) {
      setError({
        message:
          "No product image is selected. Upload or paste a product photo to continue with these details.",
      });
      return;
    }

    setDownloadingImage(true);
    setError(null);

    try {
      const res = await fetch("/api/wardrobe/import-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: chosenImage.url,
          sourceUrl: product.normalizedUrl,
        }),
      });

      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        fallbackHint?: string;
        path?: string;
        mimeType?: string;
        extension?: string;
        sha256?: string;
        dataUrl?: string;
        duplicateItem?: DuplicateWardrobeMatch | null;
      } | null;

      if (!res.ok || !body?.ok || !body.path || !body.dataUrl || !body.sha256) {
        setError({
          message:
            body?.error ??
            "Could not download the selected product image from the store.",
          fallbackHint:
            body?.fallbackHint ??
            "Try selecting another image from the gallery, or right-click the photo on the store page, copy it, and press Ctrl+V here.",
        });
        return;
      }

      if (body.duplicateItem && !allowDuplicate) {
        setDuplicateItem(body.duplicateItem);
        setError({
          message: `This exact product photo has already been imported ("${body.duplicateItem.name}"). Tick "Import anyway" if you want to add it again.`,
        });
        return;
      }

      const file = await dataUrlToFile(
        body.dataUrl,
        `store-import.${body.extension ?? "jpg"}`,
        body.mimeType ?? "image/jpeg",
      );
      const previewUrl = URL.createObjectURL(file);
      const initialValues = buildEditedInitialValues();

      onImportReady({
        file,
        previewUrl,
        originalPath: body.path,
        initialValues,
        sourceUrl: product.normalizedUrl,
        sourceBrand: edited.brand.trim() || null,
        sourceImageSha256: body.sha256,
        allowDuplicate,
        runCutout,
        runAiAnalysis,
      });

      // Reset the store import card for the next import
      setProduct(null);
      setUrl("");
      setDuplicateItem(null);
      setAllowDuplicate(false);
      setWarnings([]);
    } catch {
      setError({
        message: "Could not download the selected product image.",
        fallbackHint:
          "Try another gallery photo or copy & paste (Ctrl+V) the image directly.",
      });
    } finally {
      setDownloadingImage(false);
    }
  }, [
    product,
    duplicateItem,
    allowDuplicate,
    selectedImageIndex,
    buildEditedInitialValues,
    onImportReady,
    edited.brand,
    runCutout,
    runAiAnalysis,
  ]);

  const handleClear = () => {
    setProduct(null);
    setError(null);
    setWarnings([]);
    setDuplicateItem(null);
    setAllowDuplicate(false);
    setUrl("");
  };

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Store className="size-4.5" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Import from Store
            </h2>
            <p className="text-xs text-muted">
              Paste a product link or press{" "}
              <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[11px]">
                Ctrl+V
              </kbd>{" "}
              anywhere to paste a store URL or copied product image.
            </p>
          </div>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void extractFromUrl(url);
        }}
        className="mt-4 flex flex-col gap-2.5 sm:flex-row"
        noValidate
      >
        <div className="relative flex-1">
          <Label htmlFor="store-import-url" className="sr-only">
            Product URL
          </Label>
          <Input
            ref={urlInputRef}
            id="store-import-url"
            type="url"
            inputMode="url"
            placeholder="https://www.store.com/product/... (or press Ctrl+V)"
            value={url}
            disabled={extracting || downloadingImage}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="submit"
            loading={extracting}
            disabled={extracting || downloadingImage || !url.trim()}
          >
            <Globe className="size-4" aria-hidden />
            {extracting ? "Fetching product…" : "Import product"}
          </Button>
          {product || error ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={extracting || downloadingImage}
              onClick={handleClear}
            >
              Reset
            </Button>
          ) : null}
        </div>
      </form>

      <input
        ref={fallbackFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Upload product screenshot or photo"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onFallbackFilesWithMetadata(
              e.target.files,
              product
                ? {
                    initialValues: buildEditedInitialValues(),
                    sourceUrl: product.normalizedUrl,
                    sourceBrand: edited.brand.trim() || null,
                    allowDuplicate,
                  }
                : undefined,
            );
            setProduct(null);
            setError(null);
          }
          e.target.value = "";
        }}
      />

      {extracting ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface-muted/50 px-4 py-3 text-sm"
        >
          <Loader2 className="size-4 animate-spin text-accent" aria-hidden />
          <span>
            Inspecting product page for Schema.org, OpenGraph, and gallery photos…
          </span>
        </div>
      ) : null}

      {error ? (
        <Alert tone="danger" title="Couldn't import directly from store" className="mt-4">
          <p>{error.message}</p>
          {error.fallbackHint ? (
            <p className="mt-1 text-xs text-muted">{error.fallbackHint}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fallbackFileInputRef.current?.click()}
            >
              <ImagePlus className="size-3.5" aria-hidden />
              {product
                ? "Upload photo & keep extracted details"
                : "Upload screenshot or photo"}
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted px-2 py-1">
              <ClipboardPaste className="size-3.5" aria-hidden />
              Or copy image on the store page and press Ctrl+V
            </span>
          </div>
        </Alert>
      ) : null}

      {duplicateItem ? (
        <Alert
          tone="warning"
          title="Already in your wardrobe"
          className="mt-4"
        >
          <p>
            You already imported{" "}
            <Link
              href={`/wardrobe/${duplicateItem.id}`}
              className="font-semibold underline underline-offset-4"
            >
              {duplicateItem.name}
            </Link>{" "}
            ({duplicateItem.matchedBy === "source_url" ? "same product link" : "identical product photo"}).
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs font-medium cursor-pointer">
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={allowDuplicate}
              onChange={(e) => setAllowDuplicate(e.target.checked)}
            />
            <span>Import anyway as a separate item</span>
          </label>
        </Alert>
      ) : null}

      {warnings.map((w, i) => (
        <Alert key={i} tone="warning" className="mt-3">
          {w}
        </Alert>
      ))}

      {product ? (
        <div className="mt-5 space-y-5 border-t border-border pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
                Extracted via {sourceLabel(product.extractionSource)}
              </span>
              <a
                href={product.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground underline underline-offset-4"
              >
                View store page <ExternalLink className="size-3" aria-hidden />
              </a>
            </div>
          </div>

          {/* Step 1: Product Image Gallery Selection */}
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <p className="text-sm font-medium text-foreground">
                1. Choose a product photo ({product.images.length} found)
              </p>
              <p className="text-xs text-muted">
                Garment-only flat-lays or packshots work best, or pick a model photo.
              </p>
            </div>

            {product.images.length > 0 ? (
              <div
                className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5"
                role="radiogroup"
                aria-label="Extracted product images"
              >
                {product.images.map((img, index) => {
                  const isSelected = index === selectedImageIndex;
                  const isRecommended = index === product.recommendedImageIndex;
                  const badge = badgeForImageKind(img.kind, isRecommended);
                  const loadFailed = failedImageIndices.has(index);

                  return (
                    <button
                      key={img.url}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedImageIndex(index)}
                      className={`group relative flex flex-col overflow-hidden rounded-xl border-2 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        isSelected
                          ? "border-accent ring-2 ring-accent/20"
                          : "border-border hover:border-border-strong"
                      }`}
                    >
                      <div className="relative aspect-square w-full bg-white">
                        {loadFailed ? (
                          <div className="flex h-full flex-col items-center justify-center p-2 text-center text-xs text-muted">
                            <AlertTriangle className="size-5 text-muted mb-1" aria-hidden />
                            <span>Preview blocked by store</span>
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element -- external store preview before user selection
                          <img
                            src={img.url}
                            alt={img.alt ?? `Product photo ${index + 1}`}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-contain p-1"
                            onError={() => {
                              setFailedImageIndices((prev) => {
                                const next = new Set(prev);
                                next.add(index);
                                return next;
                              });
                            }}
                          />
                        )}
                        <span
                          className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium shadow-xs ${badge.tone}`}
                        >
                          {badge.label}
                        </span>
                        {isSelected ? (
                          <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xs">
                            <Check className="size-3" aria-hidden />
                          </span>
                        ) : null}
                      </div>
                      <div className="border-t border-border/60 bg-surface px-2 py-1.5">
                        <p className="truncate text-[11px] text-muted">
                          {img.reason}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border-strong bg-surface-muted/40 p-4 text-center">
                <p className="text-sm font-medium">
                  No downloadable gallery photos were exposed by this page
                </p>
                <p className="mt-1 text-xs text-muted">
                  You can still keep the extracted product details below — just upload a screenshot or press Ctrl+V with a copied product image.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => fallbackFileInputRef.current?.click()}
                >
                  <ImagePlus className="size-4" aria-hidden />
                  Choose photo &amp; keep details
                </Button>
              </div>
            )}
          </div>

          {/* Step 2: Editable Extracted Product Details */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              2. Review &amp; edit extracted store details
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="import-edit-title">Product title</Label>
                <Input
                  id="import-edit-title"
                  value={edited.title}
                  placeholder="Not provided by store"
                  onChange={(e) =>
                    setEdited((prev) => ({ ...prev, title: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="import-edit-brand">Brand</Label>
                <Input
                  id="import-edit-brand"
                  value={edited.brand}
                  placeholder="Not provided by store"
                  onChange={(e) =>
                    setEdited((prev) => ({ ...prev, brand: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="import-edit-category">Store category</Label>
                <Input
                  id="import-edit-category"
                  value={edited.category}
                  placeholder="Not provided by store"
                  onChange={(e) =>
                    setEdited((prev) => ({ ...prev, category: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="import-edit-color">Colour</Label>
                <Input
                  id="import-edit-color"
                  value={edited.color}
                  placeholder="Not provided by store"
                  onChange={(e) =>
                    setEdited((prev) => ({ ...prev, color: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="import-edit-material">Material / composition</Label>
                <Input
                  id="import-edit-material"
                  value={edited.material}
                  placeholder="Not provided by store"
                  onChange={(e) =>
                    setEdited((prev) => ({ ...prev, material: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          {/* Step 3: Optional Studio Cutout & AI Tagging toggles */}
          <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface-muted/40 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={runCutout}
                  onChange={(e) => setRunCutout(e.target.checked)}
                />
                <Wand2 className="size-3.5 text-accent" aria-hidden />
                <span>Apply Clean Cutout (original image is preserved)</span>
              </label>

              {aiAvailable ? (
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={runAiAnalysis}
                    onChange={(e) => setRunAiAnalysis(e.target.checked)}
                  />
                  <Sparkles className="size-3.5 text-accent" aria-hidden />
                  <span>Also run AI photo tagging</span>
                </label>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {product.images.length > 0 ? (
                <Button
                  type="button"
                  loading={downloadingImage}
                  disabled={downloadingImage}
                  onClick={() => void handleContinueToReview()}
                >
                  {downloadingImage
                    ? "Importing photo…"
                    : "Continue to wardrobe review"}
                  {!downloadingImage ? (
                    <ArrowRight className="size-4" aria-hidden />
                  ) : null}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => fallbackFileInputRef.current?.click()}
                >
                  <ImagePlus className="size-4" aria-hidden />
                  Upload photo to continue
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
