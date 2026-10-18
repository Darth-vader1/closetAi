import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyClipboardPaste,
  classifyProductImage,
  extractProductFromHtml,
  isEditablePasteTarget,
  mapProductMetadataToWardrobeFields,
} from "@/lib/import/extract-product";
import { findDuplicateImportedItem } from "@/lib/import/duplicate-check";
import {
  isProhibitedIpAddress,
  normalizeProductUrl,
  parseAndValidateImageBytes,
  resolveAndValidateHostIps,
  SafeFetchError,
  safeFetchHtml,
  safeFetchImage,
  safeFetchUrl,
  validateExternalUrlSyntax,
} from "@/lib/import/safe-fetch";

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(async () => null),
}));

// Helper to create a valid minimal PNG with custom width & height
function makeValidPngBytes(width = 400, height = 500): Uint8Array {
  const buf = Buffer.alloc(33);
  // PNG signature
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  // IHDR chunk length (13) + "IHDR"
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf[24] = 8; // bit depth
  buf[25] = 6; // color type RGBA
  return new Uint8Array(buf);
}

describe("Universal Product Import — Metadata Extraction (Priority A/B/C/D)", () => {
  it("extracts Schema.org JSON-LD Product data with priority over OpenGraph", () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta property="og:title" content="OG Fallback Title | Store" />
          <meta property="og:image" content="https://cdn.example.com/images/og-model.jpg" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "Relaxed Linen Overshirt | Arket",
              "brand": { "@type": "Brand", "name": "ARKET" },
              "description": "Lightweight overshirt woven from 100% organic linen.",
              "color": "Olive Green",
              "material": "100% Organic Linen",
              "category": "Men > Shirts > Overshirts",
              "image": [
                "https://cdn.example.com/images/shirt-model-front.jpg",
                "https://cdn.example.com/images/shirt-packshot-flatlay.jpg"
              ]
            }
          </script>
        </head>
        <body></body>
      </html>
    `;

    const result = extractProductFromHtml(
      html,
      "https://www.arket.com/en/men/shirts/product.123.html?utm_source=ig",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.product.extractionSource).toBe("json-ld");
    expect(result.product.title).toBe("Relaxed Linen Overshirt");
    expect(result.product.brand).toBe("ARKET");
    expect(result.product.color).toBe("Olive Green");
    expect(result.product.material).toBe("100% Organic Linen");
    expect(result.product.category).toBe("Men > Shirts > Overshirts");
    expect(result.product.normalizedUrl).toBe(
      "https://www.arket.com/en/men/shirts/product.123.html",
    );

    // Gallery includes both JSON-LD images + deduplicated OG image, and recommends the packshot/flatlay (index 1) over model shot (index 0)
    expect(result.product.images.length).toBe(3);
    expect(result.product.images[0].kind).toBe("model");
    expect(result.product.images[1].kind).toBe("garment-only");
    expect(result.product.recommendedImageIndex).toBe(1);

    // Mapped wardrobe fields
    const mapped = mapProductMetadataToWardrobeFields(result.product);
    expect(mapped.name).toBe("ARKET Relaxed Linen Overshirt");
    expect(mapped.category).toBe("shirts");
    expect(mapped.primaryColour).toBe("olive");
    expect(mapped.material).toBe("100% Organic Linen");
  });

  it("supports multiple JSON-LD objects, @graph arrays, and ProductGroup variants", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@graph": [
                { "@type": "Organization", "name": "COS" },
                {
                  "@type": "ProductGroup",
                  "name": "Merino Wool Crew-Neck Jumper",
                  "brand": "COS",
                  "material": "100% Merino Wool",
                  "hasVariant": [
                    {
                      "@type": "Product",
                      "name": "Merino Wool Crew-Neck Jumper - Navy",
                      "color": "Dark Navy",
                      "image": [
                        { "@type": "ImageObject", "url": "https://cdn.cos.com/jumper_model_1.jpg", "caption": "Model wearing jumper" },
                        { "@type": "ImageObject", "url": "https://cdn.cos.com/jumper_still_life_packshot.jpg", "caption": "Still life packshot" }
                      ]
                    }
                  ]
                }
              ]
            }
          </script>
        </head>
      </html>
    `;

    const result = extractProductFromHtml(html, "https://www.cos.com/en/jumper");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.product.title).toBe("Merino Wool Crew-Neck Jumper");
    expect(result.product.brand).toBe("COS");
    expect(result.product.color).toBe("Dark Navy");
    expect(result.product.material).toBe("100% Merino Wool");
    expect(result.product.images).toHaveLength(2);
    expect(result.product.recommendedImageIndex).toBe(1);
    expect(result.suggestedFields.category).toBe("sweaters");
    expect(result.suggestedFields.primaryColour).toBe("navy");
  });

  it("extracts OpenGraph-only pages when JSON-LD is absent", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Striped Cotton Poplin Shirt" />
          <meta property="product:brand" content="Ralph Lauren" />
          <meta property="og:description" content="Crisp 100% cotton poplin shirt with blue and white stripes." />
          <meta property="product:color" content="Blue / White" />
          <meta property="product:material" content="100% Cotton" />
          <meta property="product:category" content="Shirts" />
          <meta property="og:image" content="https://cdn.ralphlauren.com/shirt-flatlay.jpg" />
          <meta property="og:image" content="https://cdn.ralphlauren.com/shirt-model.jpg" />
        </head>
      </html>
    `;

    const result = extractProductFromHtml(
      html,
      "https://www.ralphlauren.com/shirt",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.product.extractionSource).toBe("opengraph");
    expect(result.product.title).toBe("Striped Cotton Poplin Shirt");
    expect(result.product.brand).toBe("Ralph Lauren");
    expect(result.product.color).toBe("Blue / White");
    expect(result.product.material).toBe("100% Cotton");
    expect(result.product.images).toHaveLength(2);
    expect(result.suggestedFields.category).toBe("shirts");
    expect(result.suggestedFields.primaryColour).toBe("blue");
    expect(result.suggestedFields.secondaryColours).toContain("white");
    expect(result.suggestedFields.pattern).toBe("striped");
  });

  it("recovers gracefully when JSON-LD is malformed by falling back to OpenGraph / Microdata", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            { "@type": "Product", "name": "Broken JSON...", INVALID_SYNTAX }
          </script>
          <meta property="og:title" content="Black Leather Chelsea Boots" />
          <meta property="product:brand" content="Dr. Martens" />
          <meta property="og:image" content="https://cdn.drmartens.com/boots-packshot.jpg" />
        </head>
      </html>
    `;

    const result = extractProductFromHtml(
      html,
      "https://www.drmartens.com/boots",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.product.extractionSource).toBe("opengraph");
    expect(result.product.title).toBe("Black Leather Chelsea Boots");
    expect(result.product.brand).toBe("Dr. Martens");
    expect(result.suggestedFields.category).toBe("boots");
    expect(result.suggestedFields.primaryColour).toBe("black");
    expect(result.suggestedFields.careType).toBe("WIPE_CLEAN");
  });

  it("does not invent missing metadata and fails clearly when a page has no product data", () => {
    const emptyPage = `<html><head><title></title></head><body><div>Welcome</div></body></html>`;
    const result = extractProductFromHtml(emptyPage, "https://example.com/");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NO_PRODUCT_DATA");
    expect(result.fallbackHint).toContain("Ctrl+V");
  });

  it("detects retailer anti-bot / Cloudflare challenge pages and returns BLOCKED_BY_STORE", () => {
    const challengeHtml = `
      <html>
        <head><title>Attention Required! | Cloudflare</title></head>
        <body>Please verify you are human. cf-browser-verification</body>
      </html>
    `;
    const result = extractProductFromHtml(
      challengeHtml,
      "https://www.zara.com/product",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("BLOCKED_BY_STORE");
  });

  it("classifies garment-only packshots vs model photos vs detail shots accurately", () => {
    expect(
      classifyProductImage(
        "https://cdn.store.com/p/123_on_model_front.jpg",
        "Model wearing jacket",
        0,
      ).kind,
    ).toBe("model");
    expect(
      classifyProductImage(
        "https://cdn.store.com/p/123_flatlay_packshot.jpg",
        "Packshot front view",
        1,
      ).kind,
    ).toBe("garment-only");
    expect(
      classifyProductImage(
        "https://cdn.store.com/p/123_fabric_closeup_detail.jpg",
        "Fabric detail",
        2,
      ).kind,
    ).toBe("detail");
  });
});

describe("Universal Product Import — URL & SSRF Security Controls", () => {
  it("rejects non-HTTP(S) protocols, credentials in URLs, non-standard ports, and malformed URLs", () => {
    expect(() => validateExternalUrlSyntax("ftp://example.com/item.jpg")).toThrow(
      SafeFetchError,
    );
    expect(() => validateExternalUrlSyntax("file:///etc/passwd")).toThrow(
      SafeFetchError,
    );
    expect(() => validateExternalUrlSyntax("javascript:alert(1)")).toThrow(
      SafeFetchError,
    );
    expect(() =>
      validateExternalUrlSyntax("https://user:pass@example.com/product"),
    ).toThrow(SafeFetchError);
    expect(() =>
      validateExternalUrlSyntax("https://example.com:8443/product"),
    ).toThrow(SafeFetchError);
    expect(() => validateExternalUrlSyntax("not-a-url")).toThrow(SafeFetchError);
  });

  it("blocks loopback, private, link-local, CGNAT, cloud metadata, and reserved IPv4 & IPv6 addresses", () => {
    // Prohibited IPv4
    expect(isProhibitedIpAddress("127.0.0.1")).toBe(true);
    expect(isProhibitedIpAddress("127.255.255.254")).toBe(true);
    expect(isProhibitedIpAddress("0.0.0.0")).toBe(true);
    expect(isProhibitedIpAddress("10.0.0.1")).toBe(true);
    expect(isProhibitedIpAddress("172.16.0.1")).toBe(true);
    expect(isProhibitedIpAddress("172.31.255.255")).toBe(true);
    expect(isProhibitedIpAddress("192.168.1.50")).toBe(true);
    expect(isProhibitedIpAddress("169.254.169.254")).toBe(true); // AWS/GCP/Azure metadata
    expect(isProhibitedIpAddress("100.64.0.1")).toBe(true); // CGNAT / Alibaba metadata
    expect(isProhibitedIpAddress("198.18.0.1")).toBe(true); // benchmarking
    expect(isProhibitedIpAddress("224.0.0.1")).toBe(true); // multicast

    // Prohibited IPv6
    expect(isProhibitedIpAddress("::1")).toBe(true);
    expect(isProhibitedIpAddress("::")).toBe(true);
    expect(isProhibitedIpAddress("fc00::1")).toBe(true);
    expect(isProhibitedIpAddress("fd12:3456:789a::1")).toBe(true);
    expect(isProhibitedIpAddress("fe80::1")).toBe(true);
    expect(isProhibitedIpAddress("ff02::1")).toBe(true);
    expect(isProhibitedIpAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isProhibitedIpAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isProhibitedIpAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isProhibitedIpAddress("2001:db8::1")).toBe(true); // documentation
    expect(isProhibitedIpAddress("2002:7f00:0001::")).toBe(true); // 6to4 embedding 127.0.0.1

    // Public IPs allowed
    expect(isProhibitedIpAddress("93.184.216.34")).toBe(false);
    expect(isProhibitedIpAddress("172.32.0.1")).toBe(false);
    expect(isProhibitedIpAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(
      false,
    );
  });

  it("blocks DNS resolution that resolves a public hostname to a private or link-local IP (DNS rebinding protection)", async () => {
    await expect(
      resolveAndValidateHostIps("evil-rebind.example.com", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ]),
    ).rejects.toMatchObject({
      code: "PROHIBITED_IP",
    });

    await expect(
      resolveAndValidateHostIps("ipv6-rebind.example.com", async () => [
        { address: "fe80::1", family: 6 },
      ]),
    ).rejects.toMatchObject({
      code: "PROHIBITED_IP",
    });
  });

  it("blocks redirects to prohibited internal addresses and enforces redirect hop limits", async () => {
    const publicDns = async () => [{ address: "93.184.216.34", family: 4 as const }];

    // 1. Redirect from a public store URL to cloud metadata 169.254.169.254 is blocked
    await expect(
      safeFetchUrl("https://store.example.com/item", {
        lookupFn: publicDns,
        transportFn: async () => ({
          statusCode: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
          body: new Uint8Array(0),
        }),
      }),
    ).rejects.toMatchObject({
      code: "PROHIBITED_IP",
    });

    // 2. Redirect from a public store URL to a hostname that resolves to 127.0.0.1 is blocked
    await expect(
      safeFetchUrl("https://store.example.com/item", {
        lookupFn: async (host) =>
          host === "internal.corp.example.com"
            ? [{ address: "127.0.0.1", family: 4 }]
            : [{ address: "93.184.216.34", family: 4 }],
        transportFn: async () => ({
          statusCode: 301,
          headers: { location: "https://internal.corp.example.com/secret" },
          body: new Uint8Array(0),
        }),
      }),
    ).rejects.toMatchObject({
      code: "PROHIBITED_IP",
    });

    // 3. Exceeding maxRedirects is blocked with TOO_MANY_REDIRECTS
    await expect(
      safeFetchUrl("https://store.example.com/loop", {
        maxRedirects: 3,
        lookupFn: publicDns,
        transportFn: async (req) => ({
          statusCode: 302,
          headers: { location: `${req.url.toString()}?hop=1` },
          body: new Uint8Array(0),
        }),
      }),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REDIRECTS",
    });
  });

  it("handles retailer HTTP 403/429 blocks and oversized responses cleanly", async () => {
    const publicDns = async () => [{ address: "93.184.216.34", family: 4 as const }];

    await expect(
      safeFetchHtml("https://www.zara.com/product", {
        lookupFn: publicDns,
        transportFn: async () => ({
          statusCode: 403,
          headers: { "content-type": "text/html" },
          body: new TextEncoder().encode("Forbidden"),
        }),
      }),
    ).rejects.toMatchObject({
      code: "UPSTREAM_BLOCKED",
    });

    await expect(
      safeFetchUrl("https://www.store.com/huge", {
        maxBytes: 100,
        lookupFn: publicDns,
        transportFn: async () => {
          throw new SafeFetchError("RESPONSE_TOO_LARGE", "Too large");
        },
      }),
    ).rejects.toMatchObject({
      code: "RESPONSE_TOO_LARGE",
    });
  });

  it("enforces image magic bytes & dimension bounds in parseAndValidateImageBytes", () => {
    // Non-image bytes rejected
    const htmlBytes = new TextEncoder().encode("<html>Not an image</html>");
    expect(() => parseAndValidateImageBytes(htmlBytes)).toThrow(
      expect.objectContaining({ code: "INVALID_IMAGE" }),
    );

    // Tiny 1x1 tracking pixel rejected
    const tinyPng = makeValidPngBytes(1, 1);
    expect(() => parseAndValidateImageBytes(tinyPng)).toThrow(
      expect.objectContaining({ code: "INVALID_IMAGE" }),
    );

    // Oversized image dimensions (> 8000px) rejected
    const hugePng = makeValidPngBytes(9000, 9000);
    expect(() => parseAndValidateImageBytes(hugePng)).toThrow(
      expect.objectContaining({ code: "INVALID_IMAGE" }),
    );

    // Valid 600x800 PNG accepted and SHA-256 computed
    const validPng = makeValidPngBytes(600, 800);
    const validated = parseAndValidateImageBytes(validPng);
    expect(validated.mimeType).toBe("image/png");
    expect(validated.width).toBe(600);
    expect(validated.height).toBe(800);
    expect(validated.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("normalizes product URLs by stripping tracking parameters while keeping product identifiers", () => {
    const normalized = normalizeProductUrl(
      "https://www.ExampleStore.com/p/linen-shirt/?color=olive&utm_source=instagram&fbclid=abc123&gclid=xyz#reviews",
    );
    expect(normalized).toBe(
      "https://www.examplestore.com/p/linen-shirt?color=olive",
    );
  });
});

describe("Universal Product Import — Clipboard Paste & Editable Input Protection", () => {
  it("classifies pasted image files and HTTP(S) store URLs while ignoring ordinary text", () => {
    const fakeImage = new File([makeValidPngBytes().buffer as ArrayBuffer], "paste.png", {
      type: "image/png",
    });
    const imageRes = classifyClipboardPaste({
      files: [fakeImage],
      text: "https://www.store.com/ignored-when-image-present",
    });
    expect(imageRes.kind).toBe("image");

    const urlRes = classifyClipboardPaste({
      files: [],
      text: "  https://www.zara.com/uk/en/linen-shirt-p01234.html  ",
    });
    expect(urlRes).toEqual({
      kind: "url",
      url: "https://www.zara.com/uk/en/linen-shirt-p01234.html",
    });

    const plainTextRes = classifyClipboardPaste({
      files: [],
      text: "Blue cotton shirt",
    });
    expect(plainTextRes.kind).toBe("ignore");
  });

  it("does not intercept clipboard events when typing inside unrelated form fields", () => {
    const allowedUrlInput = { tagName: "INPUT", type: "url" } as unknown as HTMLInputElement;
    const otherTextInput = { tagName: "INPUT", type: "text" } as unknown as EventTarget;
    const textarea = { tagName: "TEXTAREA" } as unknown as EventTarget;
    const checkbox = { tagName: "INPUT", type: "checkbox" } as unknown as EventTarget;
    const bodyDiv = { tagName: "DIV" } as unknown as EventTarget;

    // Unrelated text inputs and textareas are protected from interception
    expect(isEditablePasteTarget(otherTextInput, allowedUrlInput)).toBe(true);
    expect(isEditablePasteTarget(textarea, allowedUrlInput)).toBe(true);

    // The store URL input itself and non-text elements allow paste handling
    expect(isEditablePasteTarget(allowedUrlInput, allowedUrlInput)).toBe(false);
    expect(isEditablePasteTarget(checkbox, allowedUrlInput)).toBe(false);
    expect(isEditablePasteTarget(bodyDiv, allowedUrlInput)).toBe(false);
  });
});

describe("Universal Product Import — Duplicate Detection & API Route Authorization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects duplicates by normalized source_url or source_image_sha256 without false positives on name/colour", async () => {
    const savedItems = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        user_id: "user-1",
        name: "Black Cotton T-Shirt",
        category: "t-shirts",
        primary_colour: "black",
        source_url: "https://www.uniqlo.com/uk/en/product/u-crew-neck-t-shirt",
        source_image_sha256: "a".repeat(64),
      },
    ];

    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: (_col1: string, userId: string) => ({
            eq: (col2: string, val2: string) => ({
              limit: () => ({
                maybeSingle: async () => {
                  const found = savedItems.find(
                    (item) =>
                      item.user_id === userId &&
                      ((col2 === "source_url" && item.source_url === val2) ||
                        (col2 === "source_image_sha256" &&
                          item.source_image_sha256 === val2)),
                  );
                  return { data: found ?? null, error: null };
                },
              }),
            }),
          }),
        }),
      }),
    };

    // Same URL with tracking query params matches existing item
    const matchByUrl = await findDuplicateImportedItem(
      fakeSupabase as never,
      "user-1",
      {
        sourceUrl:
          "https://www.uniqlo.com/uk/en/product/u-crew-neck-t-shirt?utm_medium=social",
      },
    );
    expect(matchByUrl?.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(matchByUrl?.matchedBy).toBe("source_url");

    // Same image SHA-256 matches existing item
    const matchByHash = await findDuplicateImportedItem(
      fakeSupabase as never,
      "user-1",
      {
        sourceUrl: "https://www.otherstore.com/different-url",
        sourceImageSha256: "a".repeat(64),
      },
    );
    expect(matchByHash?.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(matchByHash?.matchedBy).toBe("source_image_sha256");

    // Different product URL and different image hash is NOT flagged even if both are Black Cotton T-Shirts
    const noMatch = await findDuplicateImportedItem(
      fakeSupabase as never,
      "user-1",
      {
        sourceUrl: "https://www.cos.com/en/black-cotton-t-shirt",
        sourceImageSha256: "b".repeat(64),
      },
    );
    expect(noMatch).toBeNull();
  });

  it("rejects cross-origin (403) and unauthenticated (401) requests on /api/wardrobe/import-url and /api/wardrobe/import-image", async () => {
    const { POST: importUrlPost } = await import(
      "@/app/api/wardrobe/import-url/route"
    );
    const { POST: importImagePost } = await import(
      "@/app/api/wardrobe/import-image/route"
    );

    // Cross-origin request blocked with 403
    const crossOriginReq = new NextRequest(
      "http://localhost:3000/api/wardrobe/import-url",
      {
        method: "POST",
        headers: {
          origin: "https://evil.example.com",
          host: "localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ url: "https://www.store.com/item" }),
      },
    );
    const crossOriginRes = await importUrlPost(crossOriginReq);
    expect(crossOriginRes.status).toBe(403);

    // Same-origin but unauthenticated blocked with 401
    const unauthUrlReq = new NextRequest(
      "http://localhost:3000/api/wardrobe/import-url",
      {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          host: "localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ url: "https://www.store.com/item" }),
      },
    );
    const unauthUrlRes = await importUrlPost(unauthUrlReq);
    expect(unauthUrlRes.status).toBe(401);

    const unauthImgReq = new NextRequest(
      "http://localhost:3000/api/wardrobe/import-image",
      {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          host: "localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ imageUrl: "https://www.store.com/item.jpg" }),
      },
    );
    const unauthImgRes = await importImagePost(unauthImgReq);
    expect(unauthImgRes.status).toBe(401);
  });

  it("rejects direct private IP image fetch attempts in safeFetchImage", async () => {
    await expect(
      safeFetchImage("http://127.0.0.1/internal-secret.png"),
    ).rejects.toMatchObject({
      code: "PROHIBITED_IP",
    });

    await expect(
      safeFetchImage("http://[::1]/internal-secret.png"),
    ).rejects.toMatchObject({
      code: "PROHIBITED_IP",
    });
  });
});
