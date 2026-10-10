/**
 * Identify an image by its leading bytes instead of trusting the client-supplied
 * Content-Type or file extension. Only formats we accept are recognised.
 */
export type SniffedImage = { mimeType: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" };

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB; below Vercel's 4.5 MB function body limit.

export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) {
    return { mimeType: "image/png", extension: "png" };
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { mimeType: "image/webp", extension: "webp" };
  }
  return null;
}
