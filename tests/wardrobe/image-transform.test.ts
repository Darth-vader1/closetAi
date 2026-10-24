import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { sniffImage } from "@/lib/security/image-sniff";
import {
  rotateImage,
  flipImageHorizontal,
  cropImageNormalized,
} from "@/lib/wardrobe/image-transform-client";

describe("Garment Image Transformations — Rotate & Crop", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sniffs valid JPEG and PNG bytes from base64 data URLs", () => {
    // 1x1 transparent PNG base64
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const pngBytes = new Uint8Array(Buffer.from(pngBase64, "base64"));
    const sniffedPng = sniffImage(pngBytes);
    expect(sniffedPng).not.toBeNull();
    expect(sniffedPng?.mimeType).toBe("image/png");
    expect(sniffedPng?.extension).toBe("png");

    // Minimal JPEG header
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const sniffedJpeg = sniffImage(jpegBytes);
    expect(sniffedJpeg).not.toBeNull();
    expect(sniffedJpeg?.mimeType).toBe("image/jpeg");
    expect(sniffedJpeg?.extension).toBe("jpg");
  });

  it("rotates images and swaps canvas dimensions for 90° and 270°", async () => {
    let createdCanvasWidth = 0;
    let createdCanvasHeight = 0;
    const fakeCtx = {
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
    };

    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(fakeCtx),
      toBlob: vi.fn((cb: (blob: Blob | null) => void) => {
        createdCanvasWidth = fakeCanvas.width;
        createdCanvasHeight = fakeCanvas.height;
        cb(new Blob(["test-jpeg-bytes"], { type: "image/jpeg" }));
      }),
    };

    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(fakeCanvas),
    });

    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 400;
        naturalHeight = 800;
        width = 400;
        height = 800;
        crossOrigin = "";
        src = "";
        onload: (() => void) | null = null;
        constructor() {
          setTimeout(() => this.onload?.(), 0);
        }
      },
    );

    // Rotate 90°: 400x800 becomes 800x400
    const res90 = await rotateImage("blob:http://localhost/test", 90);
    expect(res90.width).toBe(800);
    expect(res90.height).toBe(400);
    expect(createdCanvasWidth).toBe(800);
    expect(createdCanvasHeight).toBe(400);

    // Rotate 180°: 400x800 stays 400x800
    const res180 = await rotateImage("blob:http://localhost/test", 180);
    expect(res180.width).toBe(400);
    expect(res180.height).toBe(800);

    // Rotate -90° (270°): 400x800 becomes 800x400
    const resMinus90 = await rotateImage("blob:http://localhost/test", -90);
    expect(resMinus90.width).toBe(800);
    expect(resMinus90.height).toBe(400);
  });

  it("flips image horizontally preserving aspect ratio", async () => {
    const fakeCtx = {
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
    };

    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(fakeCtx),
      toBlob: vi.fn((cb: (blob: Blob | null) => void) => {
        cb(new Blob(["flipped-bytes"], { type: "image/jpeg" }));
      }),
    };

    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(fakeCanvas),
    });

    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 500;
        naturalHeight = 600;
        width = 500;
        height = 600;
        crossOrigin = "";
        src = "";
        onload: (() => void) | null = null;
        constructor() {
          setTimeout(() => this.onload?.(), 0);
        }
      },
    );

    const res = await flipImageHorizontal("blob:http://localhost/test");
    expect(res.width).toBe(500);
    expect(res.height).toBe(600);
    expect(fakeCtx.scale).toHaveBeenCalledWith(-1, 1);
  });

  it("crops normalized image rectangles with pixel clamping", async () => {
    let croppedSourceW = 0;
    let croppedSourceH = 0;
    const fakeCtx = {
      drawImage: vi.fn((_img, _sx, _sy, sw, sh) => {
        croppedSourceW = sw;
        croppedSourceH = sh;
      }),
    };

    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(fakeCtx),
      toBlob: vi.fn((cb: (blob: Blob | null) => void) => {
        cb(new Blob(["cropped-bytes"], { type: "image/jpeg" }));
      }),
    };

    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(fakeCanvas),
    });

    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 1000;
        naturalHeight = 1000;
        width = 1000;
        height = 1000;
        crossOrigin = "";
        src = "";
        onload: (() => void) | null = null;
        constructor() {
          setTimeout(() => this.onload?.(), 0);
        }
      },
    );

    // Crop center 50%
    const res = await cropImageNormalized("blob:http://localhost/test", {
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5,
    });

    expect(res.width).toBe(500);
    expect(res.height).toBe(500);
    expect(croppedSourceW).toBe(500);
    expect(croppedSourceH).toBe(500);
  });

  it("POST /api/ai/beautify accepts imageDataUrl for rotated/cropped garments", async () => {
    const { POST } = await import("@/app/api/ai/beautify/route");

    // 1x1 PNG base64
    const validPngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    const req = new NextRequest("http://localhost:3000/api/ai/beautify", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        imageDataUrl: validPngDataUrl,
        mode: "clean-cutout",
        skipSegmentation: true,
      }),
    });

    const sessionModule = await import("@/lib/auth/session");
    vi.spyOn(sessionModule, "getSessionUser").mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000001",
      email: "test@example.com",
    } as never);

    const supabaseServerModule = await import("@/lib/supabase/server");
    vi.spyOn(supabaseServerModule, "createClient").mockResolvedValue({} as never);

    const rateLimitModule = await import("@/lib/ai/rate-limit");
    vi.spyOn(rateLimitModule, "takeAiQuota").mockResolvedValue({
      allowed: true,
      remaining: 99,
      resetAt: new Date(),
    } as never);

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBeDefined();
  });
});
