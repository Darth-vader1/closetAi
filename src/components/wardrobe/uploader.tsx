"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, CheckSquare, Globe, ImagePlus, Layers, Loader2, RefreshCw, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { discardUploadAction, saveItemAction } from "@/app/(app)/wardrobe/actions";
import type { ClothingSuggestion, DetectedClothingItem } from "@/lib/ai/schemas";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { emptyItemValues, ItemFieldsForm } from "@/components/wardrobe/item-fields";
import { MultiItemCard } from "@/components/wardrobe/multi-item-card";
import {
  StoreImportCard,
  type ImportedEntryPayload,
} from "@/components/wardrobe/store-import-card";
import {
  classifyClipboardPaste,
  isEditablePasteTarget,
} from "@/lib/import/clipboard";
import type { ExtractedProductMetadata } from "@/lib/import/extract-product";
import { itemFieldsSchema, type ItemFields, type ItemFieldsInput } from "@/lib/validation/wardrobe";
import type {
  AiEnhancementParams,
  BeautificationMode,
} from "@/lib/wardrobe/beautify-engine";
import { cropGarmentFromImage } from "@/lib/wardrobe/crop-items";
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
  multiDetectedItems?: DetectedClothingItem[] | null;
  multiCropping?: boolean;
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError";

function suggestionToValues(
  s: ClothingSuggestion & { material?: string | null; careType?: string | null },
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
  const entriesRef = useRef<Entry[]>([]);
  const limiter = useRef(createLimiter(1));
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const multiScreenshotInput = useRef<HTMLInputElement>(null);
  const storeUrlInputRef = useRef<HTMLInputElement>(null);
  const formSubmittersRef = useRef(new Map<string, () => Promise<boolean>>());
  const [savingAll, setSavingAll] = useState(false);

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
    setEntries((list) => list.filter((e) => e.id !== id));
  }, []);

  const importSelectedMultiItems = useCallback(
    async (parentEntry: Entry, selected: DetectedClothingItem[]) => {
      patch(parentEntry.id, { multiCropping: true });
      try {
        const croppedEntries: Entry[] = [];

        for (const item of selected) {
          const { file: croppedFile, previewUrl } = await cropGarmentFromImage(
            parentEntry.file,
            item.box2d,
            item.suggestion.name,
          );

          const controller = new AbortController();
          const croppedId = crypto.randomUUID();
          controllers.current.set(croppedId, controller);

          const preparedBlob = await prepareImage(croppedFile);
          const uploadedPath = await uploadPhoto(preparedBlob, {
            signal: controller.signal,
            onProgress: () => {},
          });

          const suggestion: ClothingSuggestion = item.suggestion;

          const initialValues = suggestionToValues(
            suggestion,
            parentEntry.initialValues,
          );

          croppedEntries.push({
            id: croppedId,
            file: croppedFile,
            previewUrl,
            originalPreviewUrl: previewUrl,
            stage: "review",
            progress: 1,
            path: uploadedPath,
            originalPath: uploadedPath,
            photoRoomCutoutDataUrl: null,
            beautifiedPath: null,
            beautifyMode: null,
            beautifyProvider: null,
            beautifyModel: null,
            beautifyWarnings: [],
            beautifyError: null,
            suggestion,
            suggestionKey: 1,
            isMock: parentEntry.isMock,
            analysing: false,
            aiNote: null,
            error: null,
            savedId: null,
            initialValues,
            sourceUrl: parentEntry.sourceUrl,
            sourceBrand: parentEntry.sourceBrand,
            sourceImageSha256: null,
            allowDuplicate: parentEntry.allowDuplicate ?? false,
          });
        }

        setEntries((list) => {
          const idx = list.findIndex((e) => e.id === parentEntry.id);
          if (idx === -1) return [...list, ...croppedEntries];
          const next = [...list];
          next.splice(idx, 1, ...croppedEntries);
          return next;
        });

        controllers.current.delete(parentEntry.id);
      } catch (err) {
        patch(parentEntry.id, {
          multiCropping: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to isolate and crop garments from screenshot.",
        });
      }
    },
    [patch],
  );

  const handleDismissMulti = useCallback(
    (id: string) => {
      patch(id, { multiDetectedItems: null });
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
          await submitter();
        }
      }
    } finally {
      setSavingAll(false);
    }
  }, []);

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
        patch(id, { stage: "saved", savedId: result.id });
        router.refresh();
      } else {
        patch(id, { stage: "review" });
      }
      return result;
    },
    [patch, router],
  );

  const runBeautifyOnEntry = useCallback(
    async (entry: Entry, requestedMode: BeautificationMode) => {
      // If user clicks the already-active mode, toggle back to Original preview without deleting the beautified version
      if (entry.isCutout && entry.beautifyMode === requestedMode && entry.originalPreviewUrl && entry.originalPath) {
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
        let cachedCutout = entry.photoRoomCutoutDataUrl ?? null;
        let providerUsed = entry.beautifyProvider ?? "local-studio";
        let modelUsed = entry.beautifyModel ?? "closetai-cv-v2";

        let aiParams: AiEnhancementParams | null = null;
        if (origPath) {
          try {
            const res = await fetch("/api/ai/beautify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                path: origPath,
                mode: requestedMode,
                skipSegmentation: Boolean(cachedCutout),
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
            category: entry.suggestion?.category ?? null,
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
          <Layers className="size-4 text-accent" />
          <span>Order Screenshot</span>
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
            <Layers className="size-8 text-accent" aria-hidden />
            <p className="mt-3 font-semibold text-foreground">
              Upload multi-garment order screenshot
            </p>
            <p className="mt-1 max-w-md text-xs text-muted">
              Upload an order confirmation or shopping cart screenshot (SHEIN, Temu, ASOS, Zara, etc.).
              ClosetAI identifies each garment, crops it, and prepares separate review cards.
            </p>
            <div className="mt-5">
              <Button
                type="button"
                onClick={() => multiScreenshotInput.current?.click()}
              >
                <Layers className="size-4" aria-hidden /> Choose order screenshot
              </Button>
            </div>
            <input
              ref={multiScreenshotInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Upload multi-garment order screenshot"
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
        <Alert tone="success" title={`${savedCount} ${savedCount === 1 ? "garment" : "garments"} saved`}>
          <Link href="/wardrobe" className="font-medium underline underline-offset-4" onClick={() => setEntries([])}>
            Back to your wardrobe
          </Link>
        </Alert>
      ) : null}

      {/* Batch save action bar when 2 or more garments are ready for review */}
      {entries.filter((e) => (e.stage === "review" || e.stage === "saving") && !e.multiDetectedItems).length >= 2 ? (
        <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-surface border-accent/40 shadow-xs">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CheckSquare className="size-4 text-accent" />
              Batch Save (
              {
                entries.filter(
                  (e) => (e.stage === "review" || e.stage === "saving") && !e.multiDetectedItems,
                ).length
              }{" "}
              garments)
            </h3>
            <p className="text-xs text-muted">
              Save all reviewed garments to your wardrobe together.
            </p>
          </div>
          <Button
            type="button"
            onClick={handleSaveAll}
            loading={savingAll}
            disabled={savingAll || entries.some((e) => e.stage === "saving")}
          >
            Save all garments
          </Button>
        </Card>
      ) : null}

      <ul className="space-y-4" aria-label="Photos being added">
        {entries.map((entry) => (
          <li key={entry.id}>
            <EntryCard
              entry={entry}
              aiAvailable={aiAvailable}
              onRemove={removeEntry}
              onRetry={retry}
              onSave={save}
              onBeautify={runBeautifyOnEntry}
              onAnalyse={(e) => {
                if (!e.path) return;
                const fresh = new AbortController();
                controllers.current.set(e.id, fresh);
                void runAnalysis(e.id, e.originalPath ?? e.path, fresh.signal);
              }}
              onScanMulti={handleScanMulti}
              onImportMultiItems={importSelectedMultiItems}
              onDismissMulti={handleDismissMulti}
              registerSubmitter={registerSubmitter}
              unregisterSubmitter={unregisterSubmitter}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EntryCard({
  entry,
  aiAvailable,
  onRemove,
  onRetry,
  onSave,
  onAnalyse,
  onScanMulti,
  onImportMultiItems,
  onDismissMulti,
  onBeautify,
  registerSubmitter,
  unregisterSubmitter,
}: {
  entry: Entry;
  aiAvailable: boolean;
  onRemove: (id: string) => void;
  onRetry: (entry: Entry) => void;
  onSave: (id: string, values: ItemFields) => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }>;
  onAnalyse: (entry: Entry) => void;
  onScanMulti: (entry: Entry) => void;
  onImportMultiItems: (entry: Entry, selected: DetectedClothingItem[]) => void;
  onDismissMulti: (id: string) => void;
  onBeautify: (entry: Entry, mode: BeautificationMode) => void;
  registerSubmitter: (id: string, fn: () => Promise<boolean>) => void;
  unregisterSubmitter: (id: string) => void;
}) {
  if (entry.multiDetectedItems && entry.multiDetectedItems.length > 1) {
    return (
      <MultiItemCard
        sourcePreviewUrl={entry.originalPreviewUrl ?? entry.previewUrl}
        sourceFileName={entry.file.name}
        items={entry.multiDetectedItems}
        loading={Boolean(entry.multiCropping)}
        onConfirm={(selected) => onImportMultiItems(entry, selected)}
        onDismiss={() => onDismissMulti(entry.id)}
      />
    );
  }

  const busy = entry.stage === "preparing" || entry.stage === "uploading" || entry.stage === "analysing";
  const label = { preparing: "Preparing photo…", uploading: "Uploading…", analysing: "Analysing with AI…" }[entry.stage as "preparing" | "uploading" | "analysing"];

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="relative w-full shrink-0 sm:w-52">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not optimisable */}
          <img
            src={entry.previewUrl}
            alt={`Preview of ${entry.file.name}`}
            className="aspect-square w-full rounded-xl border border-border bg-white object-contain"
          />
          {entry.stage === "saved" ? (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-xs font-medium text-white">
              <CheckCircle2 className="size-3" aria-hidden /> Saved
            </span>
          ) : entry.isCutout ? (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-xs">
              <Sparkles className="size-2.5 text-accent" aria-hidden />
              {entry.beautifyMode === "ai-enhance" ? "AI Enhanced" : "Clean Cutout"}
            </span>
          ) : null}

          {/* Beautify Image Controls (Mode 1: Clean Cutout & Mode 2: AI Enhance) */}
          {entry.stage === "review" ? (
            <div className="mt-2.5 space-y-1.5">
              <p className="rounded-lg border border-border/70 bg-surface-muted/60 px-2 py-1 text-[10px] leading-snug text-muted">
                <strong>Notice:</strong> Clean Cutout &amp; AI Enhance send this photo to{" "}
                <strong>PhotoRoom</strong> (and Gemini for AI Enhance calibration). Original photo is
                preserved.
              </p>
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

        <div className="min-w-0 flex-1">
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
              onSave={onSave}
              onRemove={onRemove}
              onAnalyse={onAnalyse}
              onScanMulti={onScanMulti}
              registerSubmitter={registerSubmitter}
              unregisterSubmitter={unregisterSubmitter}
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
  onSave,
  onRemove,
  onAnalyse,
  onScanMulti,
  registerSubmitter,
  unregisterSubmitter,
}: {
  entry: Entry;
  aiAvailable: boolean;
  onSave: (id: string, values: ItemFields) => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }>;
  onRemove: (id: string) => void;
  onAnalyse: (entry: Entry) => void;
  onScanMulti: (entry: Entry) => void;
  registerSubmitter: (id: string, fn: () => Promise<boolean>) => void;
  unregisterSubmitter: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ItemFieldsInput, unknown, ItemFields>({
    resolver: zodResolver(itemFieldsSchema),
    defaultValues: entry.suggestion
      ? suggestionToValues(entry.suggestion, entry.initialValues)
      : (entry.initialValues ?? emptyItemValues()),
  });

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
            for (const [name, message] of Object.entries(result.fieldErrors ?? {})) {
              form.setError(name as keyof ItemFieldsInput, { message });
            }
            ok = false;
          } else {
            ok = true;
          }
        },
        () => {
          ok = false;
        },
      )();
      return ok;
    };

    registerSubmitter(entry.id, submitForm);
    return () => {
      unregisterSubmitter(entry.id);
    };
  }, [entry.id, form, onSave, registerSubmitter, unregisterSubmitter]);

  const saved = entry.stage === "saved";
  const saving = entry.stage === "saving";

  if (saved) {
    return (
      <div className="space-y-3">
        <p className="font-medium">{form.getValues("name")}</p>
        <p className="text-sm text-muted">Added to your wardrobe as clean.</p>
        {entry.savedId ? (
          <Link href={`/wardrobe/${entry.savedId}`} className="text-sm font-medium text-accent underline underline-offset-4">
            View item
          </Link>
        ) : null}
      </div>
    );
  }

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    const result = await onSave(entry.id, values);
    if (!result.ok) {
      setError(result.error ?? "Couldn't save this item.");
      for (const [name, message] of Object.entries(result.fieldErrors ?? {})) form.setError(name as keyof ItemFieldsInput, { message });
    }
  });

  return (
    <form onSubmit={submit} className="space-y-5" noValidate aria-label={`Details for ${entry.file.name}`}>
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
      {entry.aiNote ? <Alert tone="info">{entry.aiNote}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <ItemFieldsForm form={form} idPrefix={`item-${entry.id}`} highlight={entry.suggestion?.uncertainFields ?? []} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => onRemove(entry.id)}>
            <Trash2 className="size-4" aria-hidden /> Remove photo
          </Button>
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
                title="Detect and isolate multiple garments in this photo (e.g. SHEIN or Temu order screenshot)"
              >
                <Layers className="size-4 text-accent" aria-hidden />
                Scan for multiple garments
              </Button>
            </>
          ) : null}
        </div>
        <Button type="submit" loading={saving}>
          Save to wardrobe
        </Button>
      </div>
    </form>
  );
}
