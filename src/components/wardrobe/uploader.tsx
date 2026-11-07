"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, CheckSquare, ChevronDown, ChevronUp, Crop, Globe, ImagePlus, Layers, Loader2, RefreshCw, RotateCcw, RotateCw, Sparkles, Trash2, UserCheck, Wand2, X } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { saveStylistOutfitAction, wearOutfitTodayAction } from "@/app/(app)/stylist/actions";
import { discardUploadAction, saveItemAction } from "@/app/(app)/wardrobe/actions";
import type { ClothingSuggestion, DetectedClothingItem } from "@/lib/ai/schemas";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { ImageCropperModal } from "@/components/wardrobe/image-cropper-modal";
import { emptyItemValues, ItemFieldsForm } from "@/components/wardrobe/item-fields";
import {
  MultiItemCard,
  type MultiExtractProgress,
  type MultiItemExtractOptions,
} from "@/components/wardrobe/multi-item-card";
import {
  StoreImportCard,
  type ImportedEntryPayload,
} from "@/components/wardrobe/store-import-card";
import { SwipeReviewDeck } from "@/components/wardrobe/swipe-review-deck";
import {
  classifyClipboardPaste,
  isEditablePasteTarget,
} from "@/lib/import/clipboard";
import type { ExtractedProductMetadata } from "@/lib/import/extract-product";
import { cn } from "@/lib/utils/cn";
import { itemFieldsSchema, type ItemFields, type ItemFieldsInput } from "@/lib/validation/wardrobe";
import { humanise } from "@/lib/wardrobe/categories";
import type {
  AiEnhancementParams,
  BeautificationMode,
} from "@/lib/wardrobe/beautify-engine";
import { cropGarmentFromImage } from "@/lib/wardrobe/crop-items";
import {
  rotateImage,
  type TransformedImageResult,
} from "@/lib/wardrobe/image-transform-client";
import { beautifyGarmentImage } from "@/lib/wardrobe/studio-canvas";
import {
  analysePhoto,
  createLimiter,
  detectScreenshotItems,
  isAcceptedFile,
  MAX_FILES_PER_BATCH,
  prepareImage,
  uploadPhoto,
} from "@/lib/wardrobe/upload-client";

type Stage = "preparing" | "uploading" | "analysing" | "review" | "saving" | "saved" | "error";

interface Entry {
  id: string;
  file: File;
  previewUrl: string;
  stage: Stage;
  progress: number;
  path: string | null;
  suggestion: ClothingSuggestion | null;
  /** Bumped whenever a new suggestion arrives, so an open form can be refilled. */
  suggestionKey: number;
  isMock: boolean;
  analysing: boolean;
  aiNote: string | null;
  error: string | null;
  savedId: string | null;
  savedTitle?: string | null;
  originalPreviewUrl?: string;
  originalPath?: string | null;
  photoRoomCutoutDataUrl?: string | null;
  beautifiedPreviewUrl?: string;
  beautifiedPath?: string | null;
  beautifyMode?: BeautificationMode | null;
  beautifyProvider?: string | null;
  beautifyModel?: string | null;
  beautifyWarnings?: string[];
  beautifyError?: string | null;
  isCutout?: boolean;
  processingCutout?: boolean;
  initialValues?: ItemFieldsInput | null;
  sourceUrl?: string | null;
  sourceBrand?: string | null;
  sourceImageSha256?: string | null;
  allowDuplicate?: boolean;
  visualDescription?: string | null;
  multiDetectedItems?: DetectedClothingItem[] | null;
  multiPhotoType?: "ootd" | "screenshot" | "flatlay" | null;
  multiOutfitTitle?: string | null;
  multiCropping?: boolean;
  multiLoadingStep?: string | null;
  multiProgress?: MultiExtractProgress | null;
}

interface PendingOutfitBundle {
  entryIds: string[];
  outfitName: string;
  markWornToday: boolean;
  ootdPhotoPath: string | null;
  creating: boolean;
  savedOutfitId: string | null;
  error: string | null;
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read blob as data URL."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error."));
    reader.readAsDataURL(blob);
  });
}

function suggestionToValues(
  s: ClothingSuggestion & { material?: string | null; careType?: string | null; brand?: string | null },
  baseValues?: ItemFieldsInput | null,
): ItemFieldsInput {
  const base = baseValues ?? emptyItemValues();
  return {
    ...base,
    name: baseValues?.name?.trim() ? baseValues.name : s.name,
    category: s.category || base.category,
    subcategory: baseValues?.subcategory?.trim()
      ? baseValues.subcategory
      : (s.subcategory ?? ""),
    brand: baseValues?.brand?.trim()
      ? baseValues.brand
      : (s.brand ?? ""),
    price: baseValues?.price ?? null,
    currency: baseValues?.currency ?? "USD",
    careType:
      s.careType === "WASHABLE" ||
      s.careType === "WIPE_CLEAN" ||
      s.careType === "NO_WASH"
        ? s.careType
        : (base.careType ?? "WASHABLE"),
    primaryColour:
      baseValues?.primaryColour ??
      (s.primaryColour as ItemFieldsInput["primaryColour"]),
    secondaryColours:
      baseValues?.secondaryColours && baseValues.secondaryColours.length > 0
        ? baseValues.secondaryColours
        : (s.secondaryColours as ItemFieldsInput["secondaryColours"]),
    pattern:
      baseValues?.pattern ?? (s.pattern as ItemFieldsInput["pattern"]),
    material: baseValues?.material?.trim()
      ? baseValues.material
      : (s.material ?? ""),
    style: baseValues?.style ?? (s.style as ItemFieldsInput["style"]),
    occasions:
      baseValues?.occasions && baseValues.occasions.length > 0
        ? baseValues.occasions
        : s.occasions,
    seasons:
      baseValues?.seasons && baseValues.seasons.length > 0
        ? baseValues.seasons
        : (s.seasons as ItemFieldsInput["seasons"]),
  };
}

export function WardrobeUploader({
  aiAvailable,
  aiUnavailableReason,
  initialImportUrl,
  initialBookmarkletProduct,
  initialTab,
}: {
  aiAvailable: boolean;
  aiUnavailableReason: string | null;
  initialImportUrl?: string | null;
  initialBookmarkletProduct?: ExtractedProductMetadata | null;
  initialTab?: "photo" | "store" | "screenshot";
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"photo" | "store" | "screenshot">(
    initialTab ??
      (initialImportUrl || initialBookmarkletProduct ? "store" : "photo"),
  );
  const [entries, setEntries] = useState<Entry[]>([]);
  const [useAi, setUseAi] = useState(aiAvailable);
  const [autoCutout, setAutoCutout] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [externalPastedUrl, setExternalPastedUrl] = useState<{
    url: string;
    key: number;
  } | null>(null);

  const controllers = useRef(new Map<string, AbortController>());
  const multiExtractAbortRef = useRef<AbortController | null>(null);
  const entriesRef = useRef<Entry[]>([]);
  const limiter = useRef(createLimiter(1));
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const multiScreenshotInput = useRef<HTMLInputElement>(null);
  const multiCameraInput = useRef<HTMLInputElement>(null);
  const storeUrlInputRef = useRef<HTMLInputElement>(null);
  const formSubmittersRef = useRef(new Map<string, () => Promise<boolean>>());
  const formValuesGettersRef = useRef(new Map<string, () => ItemFieldsInput>());
  const [savingAll, setSavingAll] = useState(false);
  const [outfitBundle, setOutfitBundle] = useState<PendingOutfitBundle | null>(null);
  const outfitBundleRef = useRef<PendingOutfitBundle | null>(null);
  const [activeDeckIndex, setActiveDeckIndex] = useState(0);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  const handleDeckIndexChange = useCallback((nextIndex: number) => {
    setActiveDeckIndex(nextIndex);
    setExpandedEntryId(null);
  }, []);

  useEffect(() => {
    outfitBundleRef.current = outfitBundle;
  }, [outfitBundle]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const patch = useCallback((id: string, changes: Partial<Entry>) => {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...changes } : e)));
  }, []);

  const registerSubmitter = useCallback(
    (id: string, fn: () => Promise<boolean>) => {
      formSubmittersRef.current.set(id, fn);
    },
    [],
  );

  const unregisterSubmitter = useCallback((id: string) => {
    formSubmittersRef.current.delete(id);
  }, []);

  const registerValuesGetter = useCallback(
    (id: string, fn: () => ItemFieldsInput) => {
      formValuesGettersRef.current.set(id, fn);
    },
    [],
  );

  const unregisterValuesGetter = useCallback((id: string) => {
    formValuesGettersRef.current.delete(id);
  }, []);

  const runAnalysis = useCallback(
    async (id: string, path: string, signal: AbortSignal) => {
      patch(id, { analysing: true, aiNote: null });
      const result = await analysePhoto(path, signal);
      if (result.status === "ok") {
        setEntries((list) =>
          list.map((e) =>
            e.id === id
              ? { ...e, analysing: false, suggestion: result.suggestion, suggestionKey: e.suggestionKey + 1, isMock: result.isMock, aiNote: null }
              : e,
          ),
        );
      } else {
        const note = result.status === "unavailable" ? `${result.reason} You can fill in the details yourself.` : result.message;
        patch(id, { analysing: false, aiNote: note });
      }
    },
    [patch],
  );

  const runMultiDetection = useCallback(
    async (id: string, path: string, signal: AbortSignal) => {
      patch(id, { analysing: true, aiNote: null });
      const result = await detectScreenshotItems(path, signal);
      if (result.status === "ok") {
        if (result.items.length > 1) {
          setEntries((list) =>
            list.map((e) =>
              e.id === id
                ? {
                    ...e,
                    analysing: false,
                    multiDetectedItems: result.items,
                    multiPhotoType: result.photoType ?? "screenshot",
                    multiOutfitTitle: result.outfitTitle ?? null,
                    isMock: result.isMock,
                    aiNote: null,
                  }
                : e,
            ),
          );
        } else if (result.items.length === 1) {
          const single = result.items[0];
          const suggestion: ClothingSuggestion = single.suggestion;
          setEntries((list) =>
            list.map((e) =>
              e.id === id
                ? {
                    ...e,
                    analysing: false,
                    suggestion,
                    suggestionKey: e.suggestionKey + 1,
                    isMock: result.isMock,
                    aiNote: null,
                  }
                : e,
            ),
          );
        } else {
          patch(id, {
            analysing: false,
            aiNote:
              "No distinct clothing items were recognized in this screenshot. You can fill in the details manually.",
          });
        }
      } else {
        const note =
          result.status === "unavailable"
            ? `${result.reason} You can fill in the details yourself.`
            : result.message;
        patch(id, { analysing: false, aiNote: note });
      }
    },
    [patch],
  );

  const process = useCallback(
    (
      entry: Entry,
      withAi: boolean,
      withAutoCutout: boolean,
      isMultiScan?: boolean,
    ) =>
      limiter.current(async () => {
        const controller = controllers.current.get(entry.id);
        if (!controller || controller.signal.aborted) return;
        try {
          patch(entry.id, { stage: "preparing", progress: 0, error: null });
          const origBlob = await prepareImage(entry.file);

          patch(entry.id, {
            stage: "uploading",
            originalPreviewUrl: entry.previewUrl,
          });

          // Always upload and preserve the original image first
          const origPath = await uploadPhoto(origBlob, {
            signal: controller.signal,
            onProgress: (f) => patch(entry.id, { progress: withAutoCutout && !isMultiScan ? f * 0.6 : f }),
          });

          let activePath = origPath;
          let beautifiedPath: string | null = null;
          let beautifiedPreviewUrl: string | undefined;
          let photoRoomCutoutDataUrl: string | null = null;
          let beautifyProvider: string | null = null;
          let beautifyModel: string | null = null;
          let beautifyWarnings: string[] = [];
          let isCutout = false;

          if (withAutoCutout && !isMultiScan) {
            try {
              const apiRes = await fetch("/api/ai/beautify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: origPath, mode: "clean-cutout" }),
                signal: controller.signal,
              }).catch(() => null);

              if (apiRes?.ok) {
                const body = (await apiRes.json()) as {
                  cutoutDataUrl?: string | null;
                  provider?: string;
                  model?: string;
                };
                if (body.cutoutDataUrl) {
                  photoRoomCutoutDataUrl = body.cutoutDataUrl;
                }
                beautifyProvider = body.provider ?? "local-studio";
                beautifyModel = body.model ?? "closetai-cv-v2";
              }

              const res = await beautifyGarmentImage(
                photoRoomCutoutDataUrl ?? origBlob,
                {
                  mode: "clean-cutout",
                  tolerance: 36,
                  background: "clean-white",
                  addShadow: true,
                },
              );
              beautifiedPath = await uploadPhoto(res.blob, {
                signal: controller.signal,
                onProgress: (f) => patch(entry.id, { progress: 0.6 + f * 0.4 }),
              });
              beautifiedPreviewUrl = URL.createObjectURL(res.blob);
              activePath = beautifiedPath;
              beautifyWarnings = res.diagnostics.warnings;
              isCutout = true;
            } catch (cutoutErr) {
              console.warn("Auto cutout skipped:", cutoutErr);
            }
          }

          patch(entry.id, {
            path: activePath,
            originalPath: origPath,
            photoRoomCutoutDataUrl,
            beautifiedPath,
            ...(beautifiedPreviewUrl
              ? {
                  previewUrl: beautifiedPreviewUrl,
                  beautifiedPreviewUrl,
                  beautifyMode: "clean-cutout",
                  beautifyProvider,
                  beautifyModel,
                  beautifyWarnings,
                  isCutout,
                }
              : {}),
            progress: 1,
          });

          if (isMultiScan) {
            patch(entry.id, { stage: "analysing" });
            await runMultiDetection(entry.id, origPath, controller.signal);
            patch(entry.id, { stage: "review" });
            return;
          }

          if (withAi) {
            patch(entry.id, { stage: "analysing" });
            await runAnalysis(entry.id, origPath, controller.signal);
            await new Promise((res) => setTimeout(res, 1500));
          }
          patch(entry.id, { stage: "review" });
        } catch (err) {
          if (isAbort(err)) return;
          patch(entry.id, { stage: "error", error: err instanceof Error ? err.message : "Something went wrong with this photo." });
        }
      }),
    [patch, runAnalysis, runMultiDetection],
  );

  const addFiles = useCallback(
    (
      fileList: FileList | File[],
      importContext?: {
        initialValues: ItemFieldsInput;
        sourceUrl: string | null;
        sourceBrand: string | null;
        allowDuplicate: boolean;
      },
      isMultiScan?: boolean,
    ) => {
      const incoming = Array.from(fileList);
      const accepted = incoming.filter(isAcceptedFile);
      const rejected = incoming.length - accepted.length;
      const room = Math.max(0, MAX_FILES_PER_BATCH - entriesRef.current.length);
      const take = accepted.slice(0, room);

      const messages: string[] = [];
      if (rejected > 0) messages.push(`${rejected} ${rejected === 1 ? "file was" : "files were"} skipped because only JPEG, PNG and WebP photos are supported.`);
      if (accepted.length > take.length) messages.push(`Only ${MAX_FILES_PER_BATCH} photos can be added at a time.`);
      setNotice(messages.length ? messages.join(" ") : null);
      if (take.length === 0) return;

      const fresh: Entry[] = take.map((file) => {
        const objUrl = URL.createObjectURL(file);
        return {
          id: crypto.randomUUID(),
          file,
          previewUrl: objUrl,
          originalPreviewUrl: objUrl,
          stage: "preparing",
          progress: 0,
          path: null,
          originalPath: null,
          photoRoomCutoutDataUrl: null,
          beautifiedPath: null,
          beautifyMode: null,
          beautifyProvider: null,
          beautifyModel: null,
          beautifyWarnings: [],
          beautifyError: null,
          suggestion: null,
          suggestionKey: 0,
          isMock: false,
          analysing: false,
          aiNote: null,
          error: null,
          savedId: null,
          initialValues: importContext?.initialValues ?? null,
          sourceUrl: importContext?.sourceUrl ?? null,
          sourceBrand: importContext?.sourceBrand ?? null,
          sourceImageSha256: null,
          allowDuplicate: importContext?.allowDuplicate ?? false,
          multiDetectedItems: null,
          multiCropping: false,
        };
      });
      for (const e of fresh) controllers.current.set(e.id, new AbortController());
      setEntries((list) => [...list, ...fresh]);
      // When store metadata is already attached as a fallback, don't force automatic AI unless user has no store title
      const shouldRunAi = importContext
        ? false
        : useAi && aiAvailable;
      for (const e of fresh) void process(e, shouldRunAi, autoCutout, isMultiScan);
    },
    [process, useAi, aiAvailable, autoCutout],
  );

  const removeEntry = useCallback((id: string) => {
    const entry = entriesRef.current.find((e) => e.id === id);
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    if (entry) {
      URL.revokeObjectURL(entry.previewUrl);
      if (entry.originalPreviewUrl && entry.originalPreviewUrl !== entry.previewUrl) {
        URL.revokeObjectURL(entry.originalPreviewUrl);
      }
      if (entry.beautifiedPreviewUrl && entry.beautifiedPreviewUrl !== entry.previewUrl) {
        URL.revokeObjectURL(entry.beautifiedPreviewUrl);
      }
      if (entry.stage !== "saved") {
        const uniquePaths = new Set(
          [entry.path, entry.originalPath, entry.beautifiedPath].filter(
            (p): p is string => Boolean(p),
          ),
        );
        for (const p of uniquePaths) {
          void discardUploadAction(p);
        }
      }
    }
    setOutfitBundle((prev) => {
      if (!prev || !prev.entryIds.includes(id)) return prev;
      const remaining = prev.entryIds.filter((eid) => eid !== id);
      if (remaining.length < 2 && !prev.savedOutfitId) return null;
      return { ...prev, entryIds: remaining };
    });
    setExpandedEntryId((prev) => (prev === id ? null : prev));
    setEntries((list) => list.filter((e) => e.id !== id));
  }, []);

  const cancelMultiExtraction = useCallback(
    (id: string) => {
      if (multiExtractAbortRef.current) {
        multiExtractAbortRef.current.abort();
        multiExtractAbortRef.current = null;
      }
      patch(id, {
        multiCropping: false,
        multiLoadingStep: null,
        multiProgress: null,
      });
    },
    [patch],
  );

  const importSelectedMultiItems = useCallback(
    async (
      parentEntry: Entry,
      selected: DetectedClothingItem[],
      extractOptions: MultiItemExtractOptions,
    ) => {
      const abortController = new AbortController();
      multiExtractAbortRef.current = abortController;

      patch(parentEntry.id, {
        multiCropping: true,
        multiLoadingStep: `Extracting ${selected.length} pieces…`,
        multiProgress: {
          current: 1,
          total: selected.length,
          stageName: "Preparing extraction…",
          itemName: selected[0]?.suggestion.name || "First piece",
          percent: 5,
        },
      });

      try {
        const croppedEntries: Entry[] = [];
        let beautifyQuotaReached = false;
        let beautifyQuotaMessage: string | null = null;

        for (let idx = 0; idx < selected.length; idx++) {
          if (abortController.signal.aborted) break;

          const item = selected[idx];
          const itemName = item.suggestion.name || `Garment ${idx + 1}`;
          const percentBase = Math.round((idx / selected.length) * 100);

          patch(parentEntry.id, {
            multiCropping: true,
            multiLoadingStep: `Extracting piece ${idx + 1} of ${selected.length}`,
            multiProgress: {
              current: idx + 1,
              total: selected.length,
              stageName: "Cropping bounding box…",
              itemName,
              percent: Math.max(5, percentBase),
            },
          });

          const { file: croppedFile, previewUrl } = await cropGarmentFromImage(
            parentEntry.file,
            item.box2d,
            itemName,
            item.wornOnBody ? 0.06 : 0.04,
          );

          if (abortController.signal.aborted) break;

          const croppedId = crypto.randomUUID();
          controllers.current.set(croppedId, abortController);

          const preparedBlob = await prepareImage(croppedFile);
          if (abortController.signal.aborted) break;

          patch(parentEntry.id, {
            multiProgress: {
              current: idx + 1,
              total: selected.length,
              stageName:
                extractOptions.studioExtraction === "catalog-flatlay"
                  ? "Generating de-body studio flat-lay…"
                  : extractOptions.studioExtraction === "clean-cutout"
                    ? "Removing background…"
                    : "Uploading photo…",
              itemName,
              percent: Math.round(((idx + 0.35) / selected.length) * 100),
            },
          });

          const uploadedPath = await uploadPhoto(preparedBlob, {
            signal: abortController.signal,
            onProgress: () => {},
          });

          if (abortController.signal.aborted) break;

          let finalPath = uploadedPath;
          let finalPreviewUrl = previewUrl;
          let beautifiedPath: string | null = null;
          let beautifiedPreviewUrl: string | undefined;
          let photoRoomCutoutDataUrl: string | null = null;
          let beautifyMode: BeautificationMode | null = null;
          let beautifyProvider: string | null = null;
          let beautifyModel: string | null = null;
          let beautifyWarnings: string[] = [];
          let entryAiNote: string | null = null;
          let isCutout = false;

          if (extractOptions.studioExtraction !== "crop-only" && !abortController.signal.aborted) {
            try {
              const targetMode = extractOptions.studioExtraction;

              if (!beautifyQuotaReached) {
                // Allow 135s for generative De-Body Flat-Lay (server retry + fallback budget is ~125s) and 45s for Clean Cutout
                const timeoutMs = targetMode === "catalog-flatlay" ? 135_000 : 45_000;
                const timeoutSignal = AbortSignal.timeout(timeoutMs);
                const combinedSignal = AbortSignal.any
                  ? AbortSignal.any([abortController.signal, timeoutSignal])
                  : abortController.signal;

                const inlineImageDataUrl = await blobToDataUrl(preparedBlob).catch(
                  () => null,
                );

                const apiRes = await fetch("/api/ai/beautify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...(inlineImageDataUrl
                      ? { imageDataUrl: inlineImageDataUrl }
                      : { path: uploadedPath }),
                    mode: targetMode,
                    category: item.suggestion.category ?? null,
                    itemHints: {
                      name: item.suggestion.name ?? null,
                      subcategory: item.suggestion.subcategory ?? null,
                      primaryColour: item.suggestion.primaryColour ?? null,
                      secondaryColours: item.suggestion.secondaryColours ?? [],
                      pattern: item.suggestion.pattern ?? null,
                      visualDescription: item.visualDescription ?? null,
                    },
                  }),
                  signal: combinedSignal,
                }).catch((err) => {
                  console.warn("Studio beautify network error or timeout:", err);
                  return null;
                });

                if (abortController.signal.aborted) break;

                if (apiRes?.ok) {
                  const body = (await apiRes.json()) as {
                    cutoutDataUrl?: string | null;
                    provider?: string;
                    model?: string;
                    reason?: string | null;
                  };
                  if (body.cutoutDataUrl) {
                    photoRoomCutoutDataUrl = body.cutoutDataUrl;
                  }
                  beautifyProvider = body.provider ?? "local-studio";
                  beautifyModel = body.model ?? "closetai-cv-v2";
                  if (!body.cutoutDataUrl && body.reason) {
                    entryAiNote = body.reason;
                  }
                } else if (apiRes?.status === 403) {
                  const errBody = (await apiRes.json().catch(() => null)) as {
                    error?: string;
                    upgradeRequired?: boolean;
                  } | null;
                  if (errBody?.upgradeRequired) {
                    beautifyQuotaReached = true;
                    beautifyQuotaMessage =
                      errBody.error ??
                      "Monthly Studio Beautify limit reached; applied local studio cutout.";
                  }
                }
              }

              if (beautifyQuotaReached && beautifyQuotaMessage) {
                entryAiNote = beautifyQuotaMessage;
                beautifyProvider = "local-studio";
                beautifyModel = "closetai-cv-v2";
              }

              patch(parentEntry.id, {
                multiProgress: {
                  current: idx + 1,
                  total: selected.length,
                  stageName: "Rendering studio canvas…",
                  itemName,
                  percent: Math.round(((idx + 0.65) / selected.length) * 100),
                },
              });

              const beautified = await beautifyGarmentImage(
                photoRoomCutoutDataUrl ?? preparedBlob,
                {
                  mode: targetMode,
                  category: item.suggestion.category ?? null,
                  tolerance: 36,
                  background: "clean-white",
                  addShadow: true,
                  targetCanvasSize: 1024,
                },
              );

              if (abortController.signal.aborted) break;

              patch(parentEntry.id, {
                multiProgress: {
                  current: idx + 1,
                  total: selected.length,
                  stageName: "Saving studio image…",
                  itemName,
                  percent: Math.round(((idx + 0.85) / selected.length) * 100),
                },
              });

              beautifiedPath = await uploadPhoto(beautified.blob, {
                signal: abortController.signal,
                onProgress: () => {},
              });
              beautifiedPreviewUrl = URL.createObjectURL(beautified.blob);
              finalPath = beautifiedPath;
              finalPreviewUrl = beautifiedPreviewUrl;
              beautifyMode = beautified.modeUsed;
              beautifyWarnings = beautified.diagnostics.warnings;
              isCutout = true;
            } catch (studioErr) {
              console.warn("OOTD studio extraction fell back to clean crop:", studioErr);
            }
          }

          if (abortController.signal.aborted) break;

          const suggestion: ClothingSuggestion = item.suggestion;
          const initialValues = suggestionToValues(
            suggestion,
            parentEntry.initialValues,
          );

          croppedEntries.push({
            id: croppedId,
            file: croppedFile,
            previewUrl: finalPreviewUrl,
            originalPreviewUrl: previewUrl,
            beautifiedPreviewUrl,
            stage: "review",
            progress: 1,
            path: finalPath,
            originalPath: uploadedPath,
            photoRoomCutoutDataUrl,
            beautifiedPath,
            beautifyMode,
            beautifyProvider,
            beautifyModel,
            beautifyWarnings,
            beautifyError: null,
            isCutout,
            suggestion,
            suggestionKey: 1,
            isMock: parentEntry.isMock,
            analysing: false,
            aiNote: entryAiNote,
            error: null,
            savedId: null,
            initialValues,
            sourceUrl: parentEntry.sourceUrl,
            sourceBrand: parentEntry.sourceBrand,
            sourceImageSha256: null,
            allowDuplicate: parentEntry.allowDuplicate ?? false,
            visualDescription: item.visualDescription ?? null,
          });
        }

        if (abortController.signal.aborted) {
          multiExtractAbortRef.current = null;
          patch(parentEntry.id, {
            multiCropping: false,
            multiLoadingStep: null,
            multiProgress: null,
          });
          return;
        }

        patch(parentEntry.id, {
          multiLoadingStep: "Preparing review cards…",
          multiProgress: {
            current: selected.length,
            total: selected.length,
            stageName: "Complete! Preparing review…",
            itemName: "",
            percent: 100,
          },
        });

        const parentStoragePath = parentEntry.originalPath ?? parentEntry.path;
        if (extractOptions.bundleAsOutfit && croppedEntries.length >= 2) {
          setOutfitBundle({
            entryIds: croppedEntries.map((c) => c.id),
            outfitName: extractOptions.outfitName,
            markWornToday: extractOptions.markWornToday,
            ootdPhotoPath: parentStoragePath ?? null,
            creating: false,
            savedOutfitId: null,
            error: null,
          });
        } else if (parentStoragePath) {
          void discardUploadAction(parentStoragePath);
        }

        setEntries((list) => {
          const idx = list.findIndex((e) => e.id === parentEntry.id);
          if (idx === -1) return [...list, ...croppedEntries];
          const next = [...list];
          next.splice(idx, 1, ...croppedEntries);
          return next;
        });
        setActiveDeckIndex(0);
        setExpandedEntryId(null);

        multiExtractAbortRef.current = null;
        controllers.current.delete(parentEntry.id);
      } catch (err) {
        multiExtractAbortRef.current = null;
        patch(parentEntry.id, {
          multiCropping: false,
          multiLoadingStep: null,
          multiProgress: null,
          error:
            err instanceof Error
              ? err.message
              : "Failed to isolate and crop garments from photo.",
        });
      }
    },
    [patch],
  );

  const handleDismissMulti = useCallback(
    (id: string) => {
      if (multiExtractAbortRef.current) {
        multiExtractAbortRef.current.abort();
        multiExtractAbortRef.current = null;
      }
      patch(id, {
        multiDetectedItems: null,
        multiCropping: false,
        multiLoadingStep: null,
        multiProgress: null,
      });
    },
    [patch],
  );

  const handleScanMulti = useCallback(
    (e: Entry) => {
      if (!e.path) return;
      const fresh = new AbortController();
      controllers.current.set(e.id, fresh);
      void runMultiDetection(e.id, e.originalPath ?? e.path, fresh.signal);
    },
    [runMultiDetection],
  );

  const handleSaveAll = useCallback(async () => {
    const readyEntries = entriesRef.current.filter(
      (e) => (e.stage === "review" || e.stage === "saving") && !e.multiDetectedItems,
    );
    if (readyEntries.length === 0) return;
    setSavingAll(true);
    try {
      for (const e of readyEntries) {
        const submitter = formSubmittersRef.current.get(e.id);
        if (submitter) {
          const ok = await submitter();
          if (!ok) {
            const unsavedAfter = entriesRef.current.filter(
              (item) =>
                !(item.multiDetectedItems && item.multiDetectedItems.length > 1) &&
                item.stage !== "saved",
            );
            const failedIdx = unsavedAfter.findIndex((item) => item.id === e.id);
            if (failedIdx >= 0) setActiveDeckIndex(failedIdx);
            setExpandedEntryId(e.id);
            break;
          }
        }
      }
    } finally {
      setSavingAll(false);
    }
  }, []);

  const maybeFinalizeOutfitBundle = useCallback(
    async (justSavedEntryId: string, justSavedItemId: string) => {
      const bundle = outfitBundleRef.current;
      if (!bundle || bundle.creating || bundle.savedOutfitId || bundle.error) {
        return;
      }
      if (!bundle.entryIds.includes(justSavedEntryId)) {
        return;
      }

      const tracked = entriesRef.current.filter((e) => bundle.entryIds.includes(e.id));
      if (tracked.length < 2) return;

      const savedItemIds: string[] = [];
      for (const e of tracked) {
        const sid = e.id === justSavedEntryId ? justSavedItemId : e.savedId;
        if (!sid) return; // Still waiting on remaining garments
        savedItemIds.push(sid);
      }

      const nextCreating = { ...bundle, creating: true };
      outfitBundleRef.current = nextCreating;
      setOutfitBundle(nextCreating);

      const outfitRes = await saveStylistOutfitAction({
        name: bundle.outfitName,
        itemIds: savedItemIds,
        occasion: "Daily Wear",
        styleDescription: "Extracted directly from your OOTD photo.",
        photoPath: bundle.ootdPhotoPath,
      });

      if (!outfitRes.ok) {
        const errState = {
          ...bundle,
          creating: false,
          error: outfitRes.error || "Saved garments, but could not bundle outfit.",
        };
        outfitBundleRef.current = errState;
        setOutfitBundle(errState);
        return;
      }

      if (bundle.markWornToday) {
        await wearOutfitTodayAction({
          outfitId: outfitRes.id,
          itemIds: savedItemIds,
        });
      }

      const doneState = {
        ...bundle,
        creating: false,
        savedOutfitId: outfitRes.id,
        error: null,
      };
      outfitBundleRef.current = doneState;
      setOutfitBundle(doneState);
      router.refresh();
    },
    [router],
  );

  const retry = useCallback(
    (entry: Entry) => {
      controllers.current.set(entry.id, new AbortController());
      void process(entry, useAi && aiAvailable, autoCutout);
    },
    [process, useAi, aiAvailable, autoCutout],
  );

  const save = useCallback(
    async (id: string, values: ItemFields) => {
      const entry = entriesRef.current.find((e) => e.id === id);
      if (!entry?.path) return { ok: false as const, error: "That photo isn't ready yet." };
      patch(id, { stage: "saving" });

      const originalImagePath = entry.originalPath ?? entry.path;
      const beautifiedImagePath = entry.beautifiedPath ?? null;
      const beautificationMode = beautifiedImagePath
        ? (entry.beautifyMode ?? "clean-cutout")
        : null;
      const beautificationStatus = beautifiedImagePath
        ? entry.path === beautifiedImagePath
          ? ("COMPLETED" as const)
          : ("RESTORED_ORIGINAL" as const)
        : ("NONE" as const);

      const result = await saveItemAction({
        ...values,
        imagePath: entry.path,
        originalImagePath,
        beautifiedImagePath,
        beautificationMode,
        beautificationProvider: beautifiedImagePath
          ? (entry.beautifyProvider ?? "local-studio")
          : null,
        beautificationModel: beautifiedImagePath
          ? (entry.beautifyModel ?? "closetai-cv-v2")
          : null,
        beautificationStatus,
        aiAnalysed: entry.suggestion !== null && !entry.isMock,
        sourceUrl: entry.sourceUrl ?? null,
        sourceBrand: entry.sourceBrand ?? null,
        sourceImageSha256: entry.sourceImageSha256 ?? null,
        allowDuplicate: entry.allowDuplicate ?? false,
      });
      if (result.ok) {
        // Both originalImagePath and beautifiedImagePath are now referenced by the saved item,
        // so the user can reopen the item later and access both versions.
        patch(id, { stage: "saved", savedId: result.id, savedTitle: values.name.trim() });
        // Synchronously reflect savedId on entriesRef so sequential batch saves see it immediately
        entriesRef.current = entriesRef.current.map((e) =>
          e.id === id ? { ...e, stage: "saved", savedId: result.id, savedTitle: values.name.trim() } : e,
        );
        await maybeFinalizeOutfitBundle(id, result.id);
        router.refresh();
      } else {
        patch(id, { stage: "review" });
      }
      return result;
    },
    [maybeFinalizeOutfitBundle, patch, router],
  );

  const runBeautifyOnEntry = useCallback(
    async (
      entry: Entry,
      requestedMode: BeautificationMode,
      forceRegenerate = false,
    ) => {
      // If user clicks the already-active mode (and didn't ask to regenerate), toggle back to Original preview
      if (
        !forceRegenerate &&
        entry.isCutout &&
        entry.beautifyMode === requestedMode &&
        entry.originalPreviewUrl &&
        entry.originalPath
      ) {
        patch(entry.id, {
          previewUrl: entry.originalPreviewUrl,
          path: entry.originalPath,
          isCutout: false,
          beautifyError: null,
        });
        return;
      }

      try {
        patch(entry.id, { processingCutout: true, beautifyError: null });
        const sourceUrl = entry.originalPreviewUrl ?? entry.previewUrl;
        const origPath = entry.originalPath ?? entry.path;
        let cachedCutout =
          requestedMode === "catalog-flatlay"
            ? null
            : (entry.photoRoomCutoutDataUrl ?? null);
        let providerUsed = entry.beautifyProvider ?? "local-studio";
        let modelUsed = entry.beautifyModel ?? "closetai-cv-v2";

        const liveValues = formValuesGettersRef.current.get(entry.id)?.();
        const activeCategory =
          liveValues?.category || entry.suggestion?.category || null;
        const activeName =
          liveValues?.name?.trim() || entry.suggestion?.name || null;
        const activeSubcategory =
          liveValues?.subcategory?.trim() ||
          entry.suggestion?.subcategory ||
          null;
        const activePrimaryColour =
          liveValues?.primaryColour || entry.suggestion?.primaryColour || null;
        const activeSecondaryColours =
          liveValues?.secondaryColours?.length
            ? liveValues.secondaryColours
            : (entry.suggestion?.secondaryColours ?? []);
        const activePattern =
          liveValues?.pattern || entry.suggestion?.pattern || null;
        const activeMaterial = liveValues?.material?.trim() || null;

        const userEditedCoreIdentity =
          Boolean(entry.suggestion) &&
          (activeName !== entry.suggestion?.name ||
            activeCategory !== entry.suggestion?.category ||
            activePrimaryColour !== entry.suggestion?.primaryColour ||
            activePattern !== entry.suggestion?.pattern);

        let aiParams: AiEnhancementParams | null = null;
        if (origPath) {
          try {
            const res = await fetch("/api/ai/beautify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                path: origPath,
                mode: requestedMode,
                category: activeCategory,
                forceVision: forceRegenerate || userEditedCoreIdentity,
                itemHints: {
                  name: activeName,
                  subcategory: activeSubcategory,
                  primaryColour: activePrimaryColour,
                  secondaryColours: activeSecondaryColours,
                  pattern: activePattern,
                  material: activeMaterial,
                  visualDescription: userEditedCoreIdentity
                    ? null
                    : (entry.visualDescription ?? null),
                },
                skipSegmentation:
                  Boolean(cachedCutout) && requestedMode !== "catalog-flatlay",
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
                cachedCutout = body.cutoutDataUrl;
              }
              if (body.provider) {
                providerUsed = body.provider;
              }
              if (body.model) {
                modelUsed = body.model;
              }
              if (body.params && requestedMode === "ai-enhance") {
                aiParams = {
                  ...body.params,
                  qualityNote:
                    body.reason ?? body.params.qualityNote ?? null,
                };
              }
            }
          } catch {
            // Safe fallback to local studio segmentation & enhancement
          }
        }

        const result = await beautifyGarmentImage(
          cachedCutout ?? sourceUrl,
          {
            mode: requestedMode,
            category: activeCategory,
            tolerance: 36,
            background: "clean-white",
            addShadow: true,
            targetCanvasSize: 1024,
            aiParams,
          },
        );

        const controller = new AbortController();
        const newBeautifiedPath = await uploadPhoto(result.blob, {
          signal: controller.signal,
          onProgress: () => {},
        });

        // Clean up any previous unsaved beautified file for this entry
        if (
          entry.beautifiedPath &&
          entry.beautifiedPath !== origPath &&
          entry.beautifiedPath !== newBeautifiedPath
        ) {
          void discardUploadAction(entry.beautifiedPath);
        }
        if (
          entry.beautifiedPreviewUrl &&
          entry.beautifiedPreviewUrl !== entry.originalPreviewUrl
        ) {
          URL.revokeObjectURL(entry.beautifiedPreviewUrl);
        }

        const newPreviewUrl = URL.createObjectURL(result.blob);
        patch(entry.id, {
          originalPreviewUrl: sourceUrl,
          originalPath: origPath,
          photoRoomCutoutDataUrl: cachedCutout,
          beautifiedPreviewUrl: newPreviewUrl,
          beautifiedPath: newBeautifiedPath,
          beautifyMode: result.modeUsed,
          beautifyProvider: providerUsed,
          beautifyModel: modelUsed,
          beautifyWarnings: result.diagnostics.warnings,
          beautifyError: null,
          previewUrl: newPreviewUrl,
          path: newBeautifiedPath,
          isCutout: true,
          processingCutout: false,
        });
      } catch (err) {
        patch(entry.id, {
          processingCutout: false,
          beautifyError:
            err instanceof Error
              ? err.message
              : "Could not beautify this photo. Your original image is kept.",
        });
      }
    },
    [patch],
  );

  const [cropperEntry, setCropperEntry] = useState<Entry | null>(null);

  const applyTransformedImageToEntry = useCallback(
    async (entry: Entry, res: TransformedImageResult) => {
      patch(entry.id, {
        previewUrl: res.url,
        originalPreviewUrl: res.url,
        stage: "review",
      });

      const controller = new AbortController();
      let newUploadedPath: string | null = null;
      try {
        newUploadedPath = await uploadPhoto(res.blob, {
          signal: controller.signal,
          onProgress: () => {},
        });
      } catch (err) {
        console.error("Failed to upload transformed image:", err);
      }

      patch(entry.id, {
        path: newUploadedPath ?? entry.path,
        originalPath: newUploadedPath ?? entry.originalPath,
        photoRoomCutoutDataUrl: null,
        beautifiedPath: null,
        beautifiedPreviewUrl: undefined,
        isCutout: false,
      });

      if (entry.isCutout && entry.beautifyMode && newUploadedPath) {
        const updatedEntry: Entry = {
          ...entry,
          previewUrl: res.url,
          originalPreviewUrl: res.url,
          path: newUploadedPath,
          originalPath: newUploadedPath,
          photoRoomCutoutDataUrl: null,
        };
        await runBeautifyOnEntry(updatedEntry, entry.beautifyMode);
      }
    },
    [patch, runBeautifyOnEntry],
  );

  const handleRotateEntry = useCallback(
    async (entry: Entry, degrees: 90 | -90) => {
      const source = entry.originalPreviewUrl ?? entry.previewUrl;
      try {
        const res = await rotateImage(source, degrees);
        await applyTransformedImageToEntry(entry, res);
      } catch (err) {
        console.error("Failed to rotate entry image:", err);
      }
    },
    [applyTransformedImageToEntry],
  );

  const handleStoreImportReady = useCallback(
    (payload: ImportedEntryPayload) => {
      const id = crypto.randomUUID();
      const controller = new AbortController();
      controllers.current.set(id, controller);

      const newEntry: Entry = {
        id,
        file: payload.file,
        previewUrl: payload.previewUrl,
        originalPreviewUrl: payload.previewUrl,
        stage: payload.runAiAnalysis ? "analysing" : "review",
        progress: 1,
        path: payload.originalPath,
        originalPath: payload.originalPath,
        photoRoomCutoutDataUrl: null,
        beautifiedPath: null,
        beautifyMode: null,
        beautifyProvider: null,
        beautifyModel: null,
        beautifyWarnings: [],
        beautifyError: null,
        suggestion: null,
        suggestionKey: 0,
        isMock: false,
        analysing: false,
        aiNote: null,
        error: null,
        savedId: null,
        initialValues: payload.initialValues,
        sourceUrl: payload.sourceUrl,
        sourceBrand: payload.sourceBrand,
        sourceImageSha256: payload.sourceImageSha256,
        allowDuplicate: payload.allowDuplicate,
      };

      setEntries((list) => [newEntry, ...list]);

      void (async () => {
        if (payload.runCutout) {
          await runBeautifyOnEntry(newEntry, "clean-cutout");
        }
        if (payload.runAiAnalysis && aiAvailable) {
          await runAnalysis(id, payload.originalPath, controller.signal);
          patch(id, { stage: "review" });
        }
      })();
    },
    [aiAvailable, patch, runAnalysis, runBeautifyOnEntry],
  );

  // Global clipboard paste support (Ctrl+V) for store URLs and copied images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isEditablePasteTarget(e.target, storeUrlInputRef.current)) {
        return;
      }

      const dt = e.clipboardData;
      if (!dt) return;

      // Collect image files from clipboardData.files or clipboardData.items
      const candidateFiles: File[] = [];
      if (dt.files && dt.files.length > 0) {
        candidateFiles.push(...Array.from(dt.files));
      } else if (dt.items) {
        for (const item of Array.from(dt.items)) {
          if (item.kind === "file" && item.type.startsWith("image/")) {
            const f = item.getAsFile();
            if (f) candidateFiles.push(f);
          }
        }
      }

      const classified = classifyClipboardPaste({
        files: candidateFiles,
        text: dt.getData("text/plain"),
      });

      if (classified.kind === "image") {
        e.preventDefault();
        setActiveTab("photo");
        addFiles(classified.files);
      } else if (classified.kind === "url") {
        e.preventDefault();
        setActiveTab("store");
        setExternalPastedUrl({ url: classified.url, key: Date.now() });
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addFiles]);

  // Warn before leaving with photos that were never saved.
  const hasUnsaved = entries.some((e) => e.stage !== "saved");
  useEffect(() => {
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  // Release object URLs and cancel in-flight work when leaving the page.
  useEffect(() => {
    const live = controllers.current;
    return () => {
      for (const c of live.values()) c.abort();
      for (const e of entriesRef.current) URL.revokeObjectURL(e.previewUrl);
    };
  }, []);

  const savedCount = entries.filter((e) => e.stage === "saved").length;

  return (
    <div className="space-y-6">
      {/* Input Mode Segments */}
      <div className="flex rounded-2xl bg-surface-muted/80 p-1.5 border border-border gap-1.5">
        <button
          type="button"
          onClick={() => setActiveTab("photo")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "photo"
              ? "bg-surface text-foreground shadow-xs border border-border/80"
              : "text-muted hover:text-foreground"
          }`}
        >
          <Camera className="size-4 text-accent" />
          <span>Photos &amp; Camera</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("store")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "store"
              ? "bg-surface text-foreground shadow-xs border border-border/80"
              : "text-muted hover:text-foreground"
          }`}
        >
          <Globe className="size-4 text-accent" />
          <span>Import from Store</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("screenshot")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "screenshot"
              ? "bg-surface text-foreground shadow-xs border border-border/80"
              : "text-muted hover:text-foreground"
          }`}
        >
          <UserCheck className="size-4 text-accent" />
          <span>OOTD &amp; Multi-Scan</span>
        </button>
      </div>

      {activeTab === "store" ? (
        <StoreImportCard
          aiAvailable={aiAvailable}
          externalPastedUrl={externalPastedUrl}
          initialUrl={initialImportUrl}
          initialProduct={initialBookmarkletProduct}
          urlInputRef={storeUrlInputRef}
          onImportReady={handleStoreImportReady}
          onFallbackFilesWithMetadata={(files, ctx, isMulti) => {
            if (isMulti) setActiveTab("screenshot");
            else setActiveTab("photo");
            addFiles(files, ctx, isMulti);
          }}
        />
      ) : null}

      {activeTab === "photo" ? (
        <Card className="p-5 sm:p-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors ${dragging ? "border-accent bg-accent-soft" : "border-border-strong bg-surface-muted/50"}`}
          >
            <ImagePlus className="size-8 text-accent" aria-hidden />
            <p className="mt-3 font-medium">Add photos of your clothes</p>
            <p className="mt-1 max-w-md text-sm text-muted">
              One garment per photo works best. JPEG, PNG or WebP, up to {MAX_FILES_PER_BATCH} at a time — or press Ctrl+V to paste a copied image.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button type="button" onClick={() => fileInput.current?.click()}>
                <ImagePlus className="size-4" aria-hidden /> Choose photos
              </Button>
              <Button type="button" variant="outline" onClick={() => cameraInput.current?.click()}>
                <Camera className="size-4" aria-hidden /> Take a photo
              </Button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              className="sr-only"
              aria-label="Choose clothing photos"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label="Take a clothing photo"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
            {aiAvailable ? (
              <label className="flex min-h-11 items-center gap-3 text-sm font-medium cursor-pointer">
                <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                <span>Suggest details with AI</span>
              </label>
            ) : (
              <p className="text-sm text-muted">AI suggestions aren&apos;t available. {aiUnavailableReason}</p>
            )}

            <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium cursor-pointer text-foreground">
              <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={autoCutout} onChange={(e) => setAutoCutout(e.target.checked)} />
              <span className="flex items-center gap-1.5">
                <Wand2 className="size-4 text-accent" />
                <span>Auto-Studio Cutout (clean background)</span>
              </span>
            </label>
          </div>
          {notice ? <Alert tone="warning" className="mt-3">{notice}</Alert> : null}
        </Card>
      ) : null}

      {activeTab === "screenshot" ? (
        <Card className="p-5 sm:p-6 border-accent/30 bg-surface">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files, undefined, true);
            }}
            className={`flex flex-col items-center rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
              dragging
                ? "border-accent bg-accent-soft"
                : "border-border-strong bg-surface-muted/50"
            }`}
          >
            <UserCheck className="size-8 text-accent" aria-hidden />
            <p className="mt-3 font-semibold text-foreground">
              Extract clothes from your OOTD or multi-item screenshot
            </p>
            <p className="mt-1 max-w-lg text-xs text-muted leading-relaxed">
              Upload a mirror selfie, full-body OOTD photo, flatlay, or shopping cart screenshot (Zara, ASOS, SHEIN, etc.).
              ClosetAI detects every piece you&apos;re wearing, strips away body &amp; background into clean studio flat-lays, and can save the whole outfit in one go.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button
                type="button"
                onClick={() => multiScreenshotInput.current?.click()}
              >
                <ImagePlus className="size-4" aria-hidden /> Choose OOTD or Screenshot
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => multiCameraInput.current?.click()}
              >
                <Camera className="size-4" aria-hidden /> Snap OOTD Photo
              </Button>
            </div>
            <input
              ref={multiScreenshotInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="sr-only"
              aria-label="Upload OOTD photo or multi-garment screenshot"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files, undefined, true);
                e.target.value = "";
              }}
            />
            <input
              ref={multiCameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label="Take an OOTD photo"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files, undefined, true);
                e.target.value = "";
              }}
            />
          </div>
          {notice ? <Alert tone="warning" className="mt-3">{notice}</Alert> : null}
        </Card>
      ) : null}

      {entries.length > 0 && savedCount === entries.length ? (
        <Alert
          tone="success"
          title={
            outfitBundle?.savedOutfitId
              ? `${savedCount} garments extracted & "${outfitBundle.outfitName}" saved${outfitBundle.markWornToday ? " (logged as worn today)" : ""}!`
              : `${savedCount} ${savedCount === 1 ? "garment" : "garments"} saved`
          }
        >
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/wardrobe"
              className="font-medium underline underline-offset-4"
              onClick={() => {
                setEntries([]);
                setOutfitBundle(null);
              }}
            >
              Back to your wardrobe
            </Link>
            {outfitBundle?.savedOutfitId && (
              <Link
                href="/studio"
                className="font-medium text-accent underline underline-offset-4"
              >
                View saved OOTD in Outfit Studio →
              </Link>
            )}
          </div>
          {outfitBundle?.error && (
            <p className="mt-1 text-xs text-amber-700">{outfitBundle.error}</p>
          )}
        </Alert>
      ) : null}

      {/* Batch save action bar when 2 or more garments are ready for review */}
      {entries.filter((e) => (e.stage === "review" || e.stage === "saving") && !e.multiDetectedItems).length >= 2 ? (
        <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-surface border-accent/40 shadow-xs">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CheckSquare className="size-4 text-accent" />
              {outfitBundle && !outfitBundle.savedOutfitId
                ? `Save All & Create "${outfitBundle.outfitName}" (`
                : "Batch Save ("}
              {
                entries.filter(
                  (e) => (e.stage === "review" || e.stage === "saving") && !e.multiDetectedItems,
                ).length
              }{" "}
              garments)
            </h3>
            <p className="text-xs text-muted">
              {outfitBundle && !outfitBundle.savedOutfitId
                ? `Saves all extracted garments to your closet and links them into your OOTD outfit${outfitBundle.markWornToday ? " (logged as worn today)" : ""}.`
                : "Save all reviewed garments to your wardrobe together."}
            </p>
          </div>
          <Button
            type="button"
            onClick={handleSaveAll}
            loading={savingAll || Boolean(outfitBundle?.creating)}
            disabled={savingAll || Boolean(outfitBundle?.creating) || entries.some((e) => e.stage === "saving")}
          >
            {outfitBundle && !outfitBundle.savedOutfitId
              ? "Save all & create OOTD"
              : "Save all garments"}
          </Button>
        </Card>
      ) : null}

      {/* Interactive Multi-Item / OOTD Bounding-Box Selectors (pre-extraction) */}
      {entries
        .filter((e) => Boolean(e.multiDetectedItems && e.multiDetectedItems.length > 1))
        .map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            aiAvailable={aiAvailable}
            isDetailsExpanded={expandedEntryId === entry.id}
            onToggleDetails={() =>
              setExpandedEntryId((prev) => (prev === entry.id ? null : entry.id))
            }
            onExpandDetails={() => setExpandedEntryId(entry.id)}
            onRemove={removeEntry}
            onRetry={retry}
            onSave={save}
            onBeautify={runBeautifyOnEntry}
            onRotate={handleRotateEntry}
            onOpenCropper={(e) => setCropperEntry(e)}
            onAnalyse={(e) => {
              if (!e.path) return;
              const fresh = new AbortController();
              controllers.current.set(e.id, fresh);
              void runAnalysis(e.id, e.originalPath ?? e.path, fresh.signal);
            }}
            onScanMulti={handleScanMulti}
            onImportMultiItems={importSelectedMultiItems}
            onDismissMulti={handleDismissMulti}
            onCancelMultiExtraction={cancelMultiExtraction}
            registerSubmitter={registerSubmitter}
            unregisterSubmitter={unregisterSubmitter}
            registerValuesGetter={registerValuesGetter}
            unregisterValuesGetter={unregisterValuesGetter}
          />
        ))}

      {/* Tinder-Style Swipe Deck for Uploaded, Store-Imported & Extracted Garments */}
      {(() => {
        const garmentEntries = entries.filter(
          (e) => !(e.multiDetectedItems && e.multiDetectedItems.length > 1),
        );
        const unsavedEntries = garmentEntries.filter((e) => e.stage !== "saved");
        const savedEntries = garmentEntries.filter((e) => e.stage === "saved");
        if (unsavedEntries.length === 0 && savedEntries.length === 0) return null;

        const entryById = new Map(unsavedEntries.map((e) => [e.id, e]));
        const resolveTitle = (e: Entry) =>
          e.savedTitle?.trim() ||
          e.suggestion?.name?.trim() ||
          e.initialValues?.name?.trim() ||
          e.file.name;

        return (
          <SwipeReviewDeck
            items={unsavedEntries.map((e) => ({
              id: e.id,
              title: resolveTitle(e),
              previewUrl: e.previewUrl,
              busy:
                e.stage === "preparing" ||
                e.stage === "uploading" ||
                e.stage === "analysing" ||
                e.stage === "saving" ||
                Boolean(e.processingCutout),
              hasError: e.stage === "error" || Boolean(e.beautifyError),
            }))}
            activeIndex={activeDeckIndex}
            onActiveIndexChange={handleDeckIndexChange}
            savedItems={savedEntries.map((e) => ({
              id: e.id,
              title: resolveTitle(e),
              previewUrl: e.previewUrl,
              savedId: e.savedId,
            }))}
            renderCard={(id) => {
              const entry = entryById.get(id);
              if (!entry) return null;
              return (
                <EntryCard
                  entry={entry}
                  aiAvailable={aiAvailable}
                  isDetailsExpanded={expandedEntryId === entry.id}
                  onToggleDetails={() =>
                    setExpandedEntryId((prev) =>
                      prev === entry.id ? null : entry.id,
                    )
                  }
                  onExpandDetails={() => setExpandedEntryId(entry.id)}
                  onRemove={removeEntry}
                  onRetry={retry}
                  onSave={save}
                  onBeautify={runBeautifyOnEntry}
                  onRotate={handleRotateEntry}
                  onOpenCropper={(e) => setCropperEntry(e)}
                  onAnalyse={(e) => {
                    if (!e.path) return;
                    const fresh = new AbortController();
                    controllers.current.set(e.id, fresh);
                    void runAnalysis(e.id, e.originalPath ?? e.path, fresh.signal);
                  }}
                  onScanMulti={handleScanMulti}
                  onImportMultiItems={importSelectedMultiItems}
                  onDismissMulti={handleDismissMulti}
                  onCancelMultiExtraction={cancelMultiExtraction}
                  registerSubmitter={registerSubmitter}
                  unregisterSubmitter={unregisterSubmitter}
                  registerValuesGetter={registerValuesGetter}
                  unregisterValuesGetter={unregisterValuesGetter}
                />
              );
            }}
          />
        );
      })()}

      {cropperEntry && (
        <ImageCropperModal
          isOpen={Boolean(cropperEntry)}
          imageUrl={cropperEntry.originalPreviewUrl ?? cropperEntry.previewUrl}
          onClose={() => setCropperEntry(null)}
          onApply={(res) => {
            void applyTransformedImageToEntry(cropperEntry, res);
            setCropperEntry(null);
          }}
          title={`Rotate & Crop: ${cropperEntry.file.name}`}
        />
      )}
    </div>
  );
}

function EntryCard({
  entry,
  aiAvailable,
  isDetailsExpanded,
  onToggleDetails,
  onExpandDetails,
  onRemove,
  onRetry,
  onSave,
  onAnalyse,
  onScanMulti,
  onImportMultiItems,
  onDismissMulti,
  onCancelMultiExtraction,
  onBeautify,
  onRotate,
  onOpenCropper,
  registerSubmitter,
  unregisterSubmitter,
  registerValuesGetter,
  unregisterValuesGetter,
}: {
  entry: Entry;
  aiAvailable: boolean;
  isDetailsExpanded: boolean;
  onToggleDetails: () => void;
  onExpandDetails: () => void;
  onRemove: (id: string) => void;
  onRetry: (entry: Entry) => void;
  onSave: (id: string, values: ItemFields) => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }>;
  onAnalyse: (entry: Entry) => void;
  onScanMulti: (entry: Entry) => void;
  onImportMultiItems: (
    entry: Entry,
    selected: DetectedClothingItem[],
    options: MultiItemExtractOptions,
  ) => void;
  onDismissMulti: (id: string) => void;
  onCancelMultiExtraction: (id: string) => void;
  onBeautify: (entry: Entry, mode: BeautificationMode, forceRegenerate?: boolean) => void;
  onRotate: (entry: Entry, degrees: 90 | -90) => void;
  onOpenCropper: (entry: Entry) => void;
  registerSubmitter: (id: string, fn: () => Promise<boolean>) => void;
  unregisterSubmitter: (id: string) => void;
  registerValuesGetter: (id: string, fn: () => ItemFieldsInput) => void;
  unregisterValuesGetter: (id: string) => void;
}) {
  if (entry.multiDetectedItems && entry.multiDetectedItems.length > 1) {
    return (
      <MultiItemCard
        sourcePreviewUrl={entry.originalPreviewUrl ?? entry.previewUrl}
        sourceFileName={entry.file.name}
        items={entry.multiDetectedItems}
        photoType={entry.multiPhotoType ?? "screenshot"}
        outfitTitle={entry.multiOutfitTitle ?? null}
        loading={Boolean(entry.multiCropping)}
        loadingStep={entry.multiLoadingStep}
        progress={entry.multiProgress}
        onConfirm={(selected, options) => onImportMultiItems(entry, selected, options)}
        onDismiss={() => onDismissMulti(entry.id)}
        onCancel={() => onCancelMultiExtraction(entry.id)}
      />
    );
  }

  const busy = entry.stage === "preparing" || entry.stage === "uploading" || entry.stage === "analysing";
  const label = { preparing: "Preparing photo…", uploading: "Uploading…", analysing: "Analysing with AI…" }[entry.stage as "preparing" | "uploading" | "analysing"];

  return (
    <Card className="p-4 sm:p-6 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="relative w-full shrink-0 sm:w-56">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not optimisable */}
          <img
            src={entry.previewUrl}
            alt={`Preview of ${entry.file.name}`}
            draggable={false}
            className="aspect-square w-full rounded-xl border border-border bg-white object-contain select-none"
          />
          {entry.stage === "saved" ? (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-xs font-medium text-white">
              <CheckCircle2 className="size-3" aria-hidden /> Saved
            </span>
          ) : entry.isCutout ? (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-xs">
              <Sparkles className="size-2.5 text-accent" aria-hidden />
              {entry.beautifyMode === "catalog-flatlay"
                ? "De-Body Flat-Lay"
                : entry.beautifyMode === "ai-enhance"
                  ? "AI Enhanced"
                  : "Clean Cutout"}
            </span>
          ) : null}

          {/* Rotate & Crop and Beautify Image Controls */}
          {entry.stage === "review" ? (
            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-1 rounded-lg border border-border/80 bg-surface-muted/60 p-1">
                <button
                  type="button"
                  title="Rotate 90° counter-clockwise"
                  onClick={() => onRotate(entry, -90)}
                  disabled={entry.processingCutout}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium text-muted hover:bg-surface hover:text-foreground transition disabled:opacity-40"
                >
                  <RotateCcw className="size-3" aria-hidden />
                  <span>-90°</span>
                </button>
                <button
                  type="button"
                  title="Rotate 90° clockwise"
                  onClick={() => onRotate(entry, 90)}
                  disabled={entry.processingCutout}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium text-muted hover:bg-surface hover:text-foreground transition disabled:opacity-40"
                >
                  <RotateCw className="size-3" aria-hidden />
                  <span>+90°</span>
                </button>
                <button
                  type="button"
                  title="Rotate & Crop garment bounds"
                  onClick={() => onOpenCropper(entry)}
                  disabled={entry.processingCutout}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium text-muted hover:bg-surface hover:text-foreground transition disabled:opacity-40"
                >
                  <Crop className="size-3 text-accent" aria-hidden />
                  <span>Crop</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  variant={
                    entry.isCutout && entry.beautifyMode === "clean-cutout"
                      ? "primary"
                      : "outline"
                  }
                  size="sm"
                  className="w-full px-2 text-[11px]"
                  disabled={entry.processingCutout}
                  loading={entry.processingCutout}
                  onClick={() => onBeautify(entry, "clean-cutout")}
                >
                  {!entry.processingCutout ? (
                    <Wand2 className="size-3" aria-hidden />
                  ) : null}
                  {entry.isCutout && entry.beautifyMode === "clean-cutout"
                    ? "Original"
                    : "Clean Cutout"}
                </Button>
                <Button
                  type="button"
                  variant={
                    entry.isCutout && entry.beautifyMode === "ai-enhance"
                      ? "primary"
                      : "outline"
                  }
                  size="sm"
                  className="w-full px-2 text-[11px]"
                  disabled={entry.processingCutout}
                  onClick={() => onBeautify(entry, "ai-enhance")}
                >
                  <Sparkles className="size-3" aria-hidden />
                  {entry.isCutout && entry.beautifyMode === "ai-enhance"
                    ? "Original"
                    : "AI Enhance"}
                </Button>
              </div>
              {entry.isCutout && entry.beautifyMode === "catalog-flatlay" ? (
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="w-full px-2 text-[11px]"
                    disabled={entry.processingCutout}
                    onClick={() => onBeautify(entry, "catalog-flatlay")}
                    title="Switch back to original cropped photo"
                  >
                    <Layers className="size-3" aria-hidden />
                    Original
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full px-2 text-[11px]"
                    disabled={entry.processingCutout}
                    loading={entry.processingCutout}
                    onClick={() => onBeautify(entry, "catalog-flatlay", true)}
                    title="Re-render flat-lay using your edited item details"
                  >
                    <RefreshCw className="size-3" aria-hidden />
                    Regenerate
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full px-2 text-[11px]"
                  disabled={entry.processingCutout}
                  onClick={() => onBeautify(entry, "catalog-flatlay")}
                  title="Remove body/skin and render a standalone unworn studio flat-lay"
                >
                  <Layers className="size-3" aria-hidden />
                  De-Body Studio Flat-Lay
                </Button>
              )}
              {entry.beautifyError ? (
                <p className="text-[11px] text-danger">{entry.beautifyError}</p>
              ) : null}
              {entry.beautifyWarnings && entry.beautifyWarnings.length > 0 ? (
                <p className="text-[11px] text-muted">
                  {entry.beautifyWarnings[0]}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 flex flex-col justify-between">
          {busy ? (
            <div role="status" aria-live="polite" className="flex h-full min-h-32 flex-col justify-center gap-3">
              <p className="flex items-center gap-2 font-medium">
                <Loader2 className="size-4 animate-spin" aria-hidden /> {label}
              </p>
              {entry.stage === "uploading" ? <progress className="h-2 w-full accent-[var(--accent)]" value={Math.round(entry.progress * 100)} max={100} aria-label={`Upload progress for ${entry.file.name}`} /> : null}
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => onRemove(entry.id)}>
                  <X className="size-4" aria-hidden /> Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {entry.stage === "error" ? (
            <div className="space-y-3">
              <Alert tone="danger" title="This photo didn't upload">{entry.error}</Alert>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => onRetry(entry)}>
                  <RefreshCw className="size-4" aria-hidden /> Try again
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onRemove(entry.id)}>
                  <Trash2 className="size-4" aria-hidden /> Remove
                </Button>
              </div>
            </div>
          ) : null}

          {entry.stage === "review" || entry.stage === "saving" || entry.stage === "saved" ? (
            <ReviewForm
              entry={entry}
              aiAvailable={aiAvailable}
              isDetailsExpanded={isDetailsExpanded}
              onToggleDetails={onToggleDetails}
              onExpandDetails={onExpandDetails}
              onSave={onSave}
              onRemove={onRemove}
              onAnalyse={onAnalyse}
              onScanMulti={onScanMulti}
              registerSubmitter={registerSubmitter}
              unregisterSubmitter={unregisterSubmitter}
              registerValuesGetter={registerValuesGetter}
              unregisterValuesGetter={unregisterValuesGetter}
            />
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function ReviewForm({
  entry,
  aiAvailable,
  isDetailsExpanded,
  onToggleDetails,
  onExpandDetails,
  onSave,
  onRemove,
  onAnalyse,
  onScanMulti,
  registerSubmitter,
  unregisterSubmitter,
  registerValuesGetter,
  unregisterValuesGetter,
}: {
  entry: Entry;
  aiAvailable: boolean;
  isDetailsExpanded: boolean;
  onToggleDetails: () => void;
  onExpandDetails: () => void;
  onSave: (id: string, values: ItemFields) => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }>;
  onRemove: (id: string) => void;
  onAnalyse: (entry: Entry) => void;
  onScanMulti: (entry: Entry) => void;
  registerSubmitter: (id: string, fn: () => Promise<boolean>) => void;
  unregisterSubmitter: (id: string) => void;
  registerValuesGetter: (id: string, fn: () => ItemFieldsInput) => void;
  unregisterValuesGetter: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ItemFieldsInput, unknown, ItemFields>({
    resolver: zodResolver(itemFieldsSchema),
    defaultValues: entry.suggestion
      ? suggestionToValues(entry.suggestion, entry.initialValues)
      : (entry.initialValues ?? emptyItemValues()),
  });

  const watchedValues = useWatch({ control: form.control });

  useEffect(() => {
    registerValuesGetter(entry.id, () => form.getValues());
    return () => {
      unregisterValuesGetter(entry.id);
    };
  }, [entry.id, form, registerValuesGetter, unregisterValuesGetter]);

  // Refill the form when the user asks for a fresh AI suggestion.
  const lastKey = useRef(entry.suggestionKey);
  useEffect(() => {
    if (entry.suggestionKey !== lastKey.current && entry.suggestion) {
      lastKey.current = entry.suggestionKey;
      form.reset(suggestionToValues(entry.suggestion, entry.initialValues));
    }
  }, [entry.suggestionKey, entry.suggestion, entry.initialValues, form]);

  useEffect(() => {
    const submitForm = async (): Promise<boolean> => {
      let ok = false;
      await form.handleSubmit(
        async (values) => {
          setError(null);
          const result = await onSave(entry.id, values);
          if (!result.ok) {
            setError(result.error ?? "Couldn't save this item.");
            const fieldEntries = Object.entries(result.fieldErrors ?? {});
            for (const [name, message] of fieldEntries) {
              form.setError(name as keyof ItemFieldsInput, { message });
            }
            if (fieldEntries.length > 0) {
              onExpandDetails();
            }
            ok = false;
          } else {
            ok = true;
          }
        },
        () => {
          onExpandDetails();
          ok = false;
        },
      )();
      return ok;
    };

    registerSubmitter(entry.id, submitForm);
    return () => {
      unregisterSubmitter(entry.id);
    };
  }, [entry.id, form, onExpandDetails, onSave, registerSubmitter, unregisterSubmitter]);

  const saved = entry.stage === "saved";
  const saving = entry.stage === "saving";

  if (saved) {
    return (
      <div className="space-y-3">
        <p className="font-medium">{watchedValues.name || "Saved garment"}</p>
        <p className="text-sm text-muted">Added to your wardrobe as clean.</p>
        {entry.savedId ? (
          <Link href={`/wardrobe/${entry.savedId}`} className="text-sm font-medium text-accent underline underline-offset-4">
            View item
          </Link>
        ) : null}
      </div>
    );
  }

  const submit = form.handleSubmit(
    async (values) => {
      setError(null);
      const result = await onSave(entry.id, values);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save this item.");
        const fieldEntries = Object.entries(result.fieldErrors ?? {});
        for (const [name, message] of fieldEntries) {
          form.setError(name as keyof ItemFieldsInput, { message });
        }
        if (fieldEntries.length > 0) {
          onExpandDetails();
        }
      }
    },
    () => {
      onExpandDetails();
    },
  );

  const detailsRegionId = `entry-details-${entry.id}`;
  const displayName = watchedValues.name?.trim() || "Untitled piece — tap Show more details";
  const displayCategory = watchedValues.category ? humanise(watchedValues.category) : null;
  const displayColour = watchedValues.primaryColour ? humanise(watchedValues.primaryColour) : null;
  const displayStyle = watchedValues.style ? humanise(watchedValues.style) : null;
  const displayBrand = watchedValues.brand?.trim() || entry.sourceBrand || null;
  const uncertainCount = entry.suggestion?.uncertainFields.length ?? 0;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-label={`Details for ${entry.file.name}`}>
      {/* Compact Card Summary Header (Always Visible) */}
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <h3 className="font-serif text-lg sm:text-xl font-medium tracking-tight text-foreground break-words">
              {displayName}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {displayCategory && (
                <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
                  {displayCategory}
                </span>
              )}
              {displayColour && (
                <span className="inline-flex items-center rounded-full border border-border bg-surface-muted/70 px-2.5 py-0.5 text-[11px] font-medium capitalize text-foreground">
                  {displayColour}
                </span>
              )}
              {displayStyle && (
                <span className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-medium capitalize text-muted">
                  {displayStyle}
                </span>
              )}
              {displayBrand && (
                <span className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted">
                  {displayBrand}
                </span>
              )}
              {uncertainCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-warning-soft px-2.5 py-0.5 text-[11px] font-medium text-warning">
                  Check {uncertainCount} AI {uncertainCount === 1 ? "field" : "fields"}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => onRemove(entry.id)}
            aria-label={`Remove ${displayName}`}
            title="Remove this piece"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger disabled:opacity-40"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>

        <p className="text-xs text-muted leading-relaxed">
          {entry.sourceUrl
            ? `Imported from store${entry.sourceBrand ? ` (${entry.sourceBrand})` : ""}. Expand details to adjust attributes.`
            : entry.suggestion && !entry.isMock
              ? "AI pre-filled garment attributes from your photo. Save directly or expand details to edit."
              : "Expand details below to review or edit garment attributes before saving."}
        </p>

        {entry.aiNote ? <Alert tone="info">{entry.aiNote}</Alert> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>

      {/* Primary Action Bar: Show More Details Dropdown + Save to Wardrobe */}
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        <button
          type="button"
          onClick={onToggleDetails}
          aria-expanded={isDetailsExpanded}
          aria-controls={detailsRegionId}
          className={cn(
            "inline-flex min-h-11 flex-1 items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-left text-xs sm:text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
            isDetailsExpanded
              ? "border-accent/40 bg-accent-soft/45 text-foreground"
              : "border-border-strong bg-surface-muted/55 text-foreground hover:bg-surface-muted",
          )}
        >
          <span>{isDetailsExpanded ? "Hide details" : "Show more details"}</span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted transition-transform duration-300",
              isDetailsExpanded && "rotate-180 text-accent",
            )}
            aria-hidden
          />
        </button>

        <Button type="submit" loading={saving} className="rounded-xl shrink-0">
          Save to wardrobe
        </Button>
      </div>

      {/* Smoothly Animated Expandable Details Dropdown */}
      <div
        id={detailsRegionId}
        role="region"
        aria-label={`Editable details for ${entry.file.name}`}
        aria-hidden={!isDetailsExpanded}
        inert={!isDetailsExpanded || undefined}
        data-no-swipe="true"
        data-details-expanded={isDetailsExpanded ? "true" : "false"}
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          isDetailsExpanded
            ? "mt-4 grid-rows-[1fr] opacity-100"
            : "mt-0 grid-rows-[0fr] opacity-0 pointer-events-none",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-5 border-t border-border pt-4">
            {entry.sourceUrl ? (
              <Alert tone="info" title="Imported from store">
                Fields were pre-filled from the store page
                {entry.sourceBrand ? ` (${entry.sourceBrand})` : ""}. Review and adjust any details below before saving.
              </Alert>
            ) : null}
            {entry.isMock ? (
              <Alert tone="warning" title="Development sample">
                This came from the mock AI provider, not a real model. It doesn&apos;t look at your photo.
              </Alert>
            ) : null}
            {entry.suggestion && !entry.isMock ? (
              <Alert tone="info" title="AI suggestion">
                Please check the details below before saving.{" "}
                {entry.suggestion.uncertainFields.length > 0 ? "Fields it wasn't sure about are flagged." : null}
              </Alert>
            ) : null}

            <ItemFieldsForm form={form} idPrefix={`item-${entry.id}`} highlight={entry.suggestion?.uncertainFields ?? []} />

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
              <div className="flex flex-wrap gap-2">
                {aiAvailable ? (
                  <>
                    <Button type="button" variant="outline" size="sm" disabled={saving || entry.analysing} loading={entry.analysing} onClick={() => onAnalyse(entry)}>
                      {!entry.analysing ? <Sparkles className="size-4" aria-hidden /> : null}
                      {entry.suggestion ? "Analyse again" : "Analyse with AI"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving || entry.analysing}
                      loading={entry.analysing}
                      onClick={() => onScanMulti(entry)}
                      title="Detect and extract multiple garments from an OOTD photo or order screenshot"
                    >
                      <UserCheck className="size-4 text-accent" aria-hidden />
                      Extract OOTD / Multi-Garments
                    </Button>
                  </>
                ) : null}
              </div>

              <button
                type="button"
                onClick={onToggleDetails}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                <ChevronUp className="size-3.5" aria-hidden />
                <span>Collapse details</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
