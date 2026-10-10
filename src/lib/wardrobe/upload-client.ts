/**
 * Browser-side helpers for the upload flow. Nothing here is trusted by the server: it re-checks
 * size, content type, ownership and path on every request.
 */
import type { ClothingSuggestion } from "@/lib/ai/schemas";

export const MAX_FILES_PER_BATCH = 20;
const MAX_EDGE_PX = 1600;
const MAX_BYTES = 3.5 * 1024 * 1024; // comfortably under the 4 MB server limit
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export class UploadError extends Error {}

export function isAcceptedFile(file: File): boolean {
  return ACCEPTED.includes(file.type.toLowerCase()) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

/**
 * Resize and re-encode a photo as JPEG before upload. Phone photos are often 5-10 MB; clothing
 * recognition and display don't need that, and smaller files upload faster and cost less to analyse.
 * Re-encoding also bakes in the EXIF orientation and drops embedded metadata such as GPS.
 */
export async function prepareImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new UploadError("This browser couldn't read that image. Try a JPEG, PNG or WebP photo.");
  }

  try {
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new UploadError("This browser can't process images.");
    ctx.fillStyle = "#ffffff"; // transparent PNGs would otherwise turn black in JPEG
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    for (const quality of [0.86, 0.75, 0.6]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_BYTES) return blob;
    }
    throw new UploadError("That photo is too large even after shrinking it. Try a smaller one.");
  } finally {
    bitmap.close();
  }
}

/** Upload with real progress and cancellation. Resolves with the private storage path. */
export function uploadPhoto(blob: Blob, opts: { onProgress: (fraction: number) => void; signal: AbortSignal }): Promise<string> {
  return new Promise((resolve, reject) => {
    if (opts.signal.aborted) return reject(new DOMException("Aborted", "AbortError"));

    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", blob, "photo.jpg");

    const onAbort = () => xhr.abort();
    opts.signal.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => opts.signal.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      cleanup();
      let body: { path?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* handled below */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.path) return resolve(body.path);
      if (xhr.status === 401) return reject(new UploadError("Your session expired. Please sign in again."));
      reject(new UploadError(body.error ?? "The upload failed. Please try again."));
    };
    xhr.onerror = () => {
      cleanup();
      reject(new UploadError("Network error. Check your connection and try again."));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    xhr.open("POST", "/api/wardrobe/upload");
    xhr.send(form);
  });
}

export type AnalyseResponse =
  | { status: "ok"; suggestion: ClothingSuggestion; provider: string; isMock: boolean }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; message: string };

export async function analysePhoto(path: string, signal: AbortSignal): Promise<AnalyseResponse> {
  let response: Response;
  try {
    response = await fetch("/api/ai/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return { status: "failed", message: "Couldn't reach the AI service. You can enter the details yourself." };
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok && (body.status === "ok" || body.status === "unavailable" || body.status === "failed")) {
    return body as AnalyseResponse;
  }
  const message = typeof body.error === "string" ? body.error : "Photo analysis isn't available right now.";
  return { status: "failed", message: `${message}` };
}

/** Runs at most `limit` async jobs at once; the rest wait their turn. */
export function createLimiter(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  const next = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await job();
    } finally {
      next();
    }
  };
}
