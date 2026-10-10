import { describe, expect, it } from "vitest";
import { sniffImage } from "@/lib/security/image-sniff";
import { isOwnStoragePath, isSameOrigin } from "@/lib/security/origin";

const h = (obj: Record<string, string>) => ({ get: (k: string) => obj[k.toLowerCase()] ?? null });

describe("sniffImage", () => {
  it("recognises JPEG, PNG and WebP by content", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))?.mimeType).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.extension).toBe("png");
    const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
    expect(sniffImage(webp)?.mimeType).toBe("image/webp");
  });

  it("rejects other content, even if it claims to be an image", () => {
    expect(sniffImage(new Uint8Array(Buffer.from("<svg onload=alert(1)>")))).toBeNull();
    expect(sniffImage(new Uint8Array(Buffer.from("GIF89a")))).toBeNull();
    expect(sniffImage(new Uint8Array(Buffer.from("%PDF-1.7")))).toBeNull();
    expect(sniffImage(new Uint8Array([]))).toBeNull();
  });
});

describe("isSameOrigin", () => {
  it("accepts a matching origin and host", () => {
    expect(isSameOrigin(h({ origin: "https://app.example.com", host: "app.example.com" }))).toBe(true);
  });
  it("prefers the forwarded host behind a proxy", () => {
    expect(isSameOrigin(h({ origin: "https://app.example.com", host: "internal:3000", "x-forwarded-host": "app.example.com" }))).toBe(true);
  });
  it("rejects other origins, missing origins and junk", () => {
    expect(isSameOrigin(h({ origin: "https://evil.com", host: "app.example.com" }))).toBe(false);
    expect(isSameOrigin(h({ host: "app.example.com" }))).toBe(false);
    expect(isSameOrigin(h({ origin: "not a url", host: "app.example.com" }))).toBe(false);
  });
});

describe("isOwnStoragePath", () => {
  const uid = "11111111-1111-4111-8111-111111111111";
  const file = "22222222-2222-4222-8222-222222222222";

  it("accepts only <uid>/<uuid>.<ext>", () => {
    expect(isOwnStoragePath(`${uid}/${file}.jpg`, uid)).toBe(true);
    expect(isOwnStoragePath(`${uid}/${file}.webp`, uid)).toBe(true);
  });

  it.each([
    ["another user's folder", `33333333-3333-4333-8333-333333333333/${file}.jpg`],
    ["path traversal", `${uid}/../${file}.jpg`],
    ["nested folder", `${uid}/x/${file}.jpg`],
    ["bad extension", `${uid}/${file}.svg`],
    ["non-uuid name", `${uid}/shell.jpg`],
    ["not a string", 42],
  ])("rejects %s", (_label, path) => {
    expect(isOwnStoragePath(path, uid)).toBe(false);
  });
});
